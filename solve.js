// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers as csv-reader 1.0.0 for every input {text, header}, much faster:
// the reference walks the text one character at a time and builds every field
// with `+=`. This reader instead dispatches per record:
//
//   - Fast path (records whose first line holds no `"` and no lone CR): no
//     quoted field can open before the line break, so the record ends there
//     and one slice + String split on ',' (both C++-fast in V8) yields it.
//   - Slow path (records holding a quote, a lone CR, quote junk, or an
//     unterminated quote): an indexOf-driven re-implementation of the
//     reference's exact state machine, slicing whole runs between specials
//     and allocating nothing per field beyond the field string itself.
//
// Every error code, error order, line number and row index matches the
// reference, including: BOM drop, blank-line skipping, stray CRs, CRLF and
// lone CRs inside quotes read as LF, doubled quotes, quote junk appended as
// it stands, unterminated quotes re-read as unquoted, short/long row
// padding and cutting, and the single-empty-unquoted-field record skip.
//
// Pure: no clock, no randomness, no locale, nothing kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// The value readUnquoted built (kept outside it so it returns only the end
// kind and allocates nothing per call).
let unqValue = '';

/** csv-reader 1.0.0's answer for one case's input: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows
  // (null while it is the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Applies the width rule to a finished record: pads (short_row) or cuts
  // (long_row) to the first record's width, or stores it as the header.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  // Reads an unquoted field starting at pos, appending its kept characters
  // onto `prefix` ('' for a fresh field, the quoted content for junk, '"'
  // for an unterminated quote). Returns how the field ended. `uqAdded`
  // counts the characters kept in this call (quote_junk needs it). A CR not
  // followed by LF is dropped (stray_cr).
  let uqAdded = 0;
  function readUnquoted(prefix) {
    uqAdded = 0;
    let acc = prefix;
    for (;;) {
      if (pos >= len) { unqValue = acc; return END; }
      const iC = text.indexOf(',', pos);
      const iN = text.indexOf('\n', pos);
      let m = len;
      let kind = END;
      if (iC !== -1) { m = iC; kind = COMMA; }
      if (iN !== -1 && iN < m) { m = iN; kind = LINE_BREAK; }
      const seg = text.slice(pos, m);
      const r = seg.indexOf('\r');
      if (r === -1) {
        if (m > pos) { acc += seg; uqAdded += m - pos; }
        if (kind === COMMA) { pos = m + 1; unqValue = acc; return COMMA; }
        if (kind === LINE_BREAK) { pos = m + 1; line += 1; unqValue = acc; return LINE_BREAK; }
        pos = m;
        unqValue = acc;
        return END;
      }
      if (r === seg.length - 1 && kind === LINE_BREAK) {
        // CRLF: the field ends at the line break.
        if (r > 0) { acc += seg.slice(0, -1); uqAdded += r; }
        pos = m + 1;
        line += 1;
        unqValue = acc;
        return LINE_BREAK;
      }
      // Lone CR: dropped, stray_cr, and the field goes on.
      if (r > 0) { acc += seg.slice(0, r); uqAdded += r; }
      error('stray_cr');
      pos += r + 1;
    }
  }

  // Reads one record the slow way (it holds a quote or a lone CR).
  function readRecordSlow() {
    const fields = [];
    let quoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let value = '';
        pos += 1;
        let closed = false;
        while (pos < len) {
          const q = text.indexOf('"', pos);
          if (q === -1) break;
          if (q > pos) {
            const seg = text.slice(pos, q);
            if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
              value += seg;
            } else {
              // CRLF and lone CR inside quotes are each one LF; every LF,
              // CRLF and lone CR counts one line.
              const rep = seg.replace(/\r\n|\r|\n/g, '\n');
              let n = 0;
              for (let i = 0; i < rep.length; i++) if (rep.charCodeAt(i) === 10) n++;
              line += n;
              value += rep;
            }
          }
          if (text.charCodeAt(q + 1) === 34) {
            value += '"';
            pos = q + 2;
            continue;
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          error('unterminated_quote');
          ended = readUnquoted('"');
          fields.push(unqValue);
          continue;
        }
        if (pos >= len) {
          fields.push(value);
          ended = END;
          continue;
        }
        const c = text[pos];
        if (c === ',') {
          pos += 1;
          fields.push(value);
          ended = COMMA;
          continue;
        }
        if (c === '\n') {
          pos += 1;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        if (c === '\r' && text[pos + 1] === '\n') {
          pos += 2;
          line += 1;
          fields.push(value);
          ended = LINE_BREAK;
          continue;
        }
        // What follows the closing quote is appended as it stands, up to
        // the next comma or line break.
        ended = readUnquoted(value);
        if (uqAdded > 0) error('quote_junk');
        fields.push(unqValue);
      } else {
        quoted = false;
        ended = readUnquoted('');
        fields.push(unqValue);
      }
    } while (ended === COMMA);
    finishRecord(fields, quoted);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: find the first line break. If the line holds no quote and
    // no CR other than a trailing CRLF one, no quoted field can open before
    // the break, the record ends there, and split(',') gives the fields.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? len : nl;
    let lineText = text.slice(pos, end);
    if (nl !== -1) {
      if (lineText.charCodeAt(lineText.length - 1) === 13) lineText = lineText.slice(0, -1);
    } else if (lineText.length > 0 && lineText.charCodeAt(lineText.length - 1) === 13) {
      // A trailing CR at end of text is a lone CR: slow path.
      readRecordSlow();
      continue;
    }
    if (lineText.indexOf('"') !== -1 || lineText.indexOf('\r') !== -1) {
      readRecordSlow();
      continue;
    }
    const fields = lineText.split(',');
    finishRecord(fields, false);
    if (nl === -1) {
      pos = len;
    } else {
      pos = nl + 1;
      line += 1;
    }
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
