// Fast drop-in replacement for csv-reader 1.0.0 (make.fun's own reference CSV reader).
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors}, with the same broken-row policy (BOM dropped, CRLF/LF
// line breaks, lone CR dropped as stray_cr, quoted fields with "" escapes and
// CRLF/lone-CR-inside read as LF, junk after a closing quote, unterminated quotes
// read again as unquoted, short/long rows padded/cut to the first record's width).
//
// Speed comes from never building a field one character at a time: native
// indexOf/slice/split jump between special characters, whole clean lines are
// split at once, and quoted fields are scanned by jumping from one special
// character to the next. No dependencies, no imports, pure.

const COMMA = 0;
const RE_U = /[,\r\n]/g; // the next comma, CR or LF (unquoted scan)
const LINE_BREAK = 1;
const END = 2;

/** How many '\r' characters a string holds. */
function countCR(s) {
  let n = 0;
  let i = -1;
  while ((i = s.indexOf('\r', i + 1)) !== -1) n++;
  return n;
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, onto `value` ('' normally; '"' when
  // re-reading an unterminated quoted field). A field ends at a comma, a line
  // break, or the end of the text; a CR not followed by LF is dropped (stray_cr).
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      RE_U.lastIndex = pos;
      const m = RE_U.exec(text);
      if (m === null) {
        const chunk = text.slice(pos);
        added += chunk.length;
        value += chunk;
        pos = len;
        return { value, ended: END, added };
      }
      const i = m.index;
      if (m[0] === ',') {
        const chunk = text.slice(pos, i);
        added += chunk.length;
        value += chunk;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (m[0] === '\n') {
        const chunk = text.slice(pos, i);
        added += chunk.length;
        value += chunk;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: part of a CRLF line break, or a stray_cr to drop.
      if (text.charCodeAt(i + 1) === 10) {
        const chunk = text.slice(pos, i);
        added += chunk.length;
        value += chunk;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      added += i - pos;
      value += text.slice(pos, i);
      pushError('stray_cr');
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let qline = line; // the line inside the quoted field, committed only when it closes
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it
        // is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote.
        value += convertSegment(text.slice(pos, q));
        value += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote.
      value += convertSegment(text.slice(pos, q));
      pos = q + 1;
      line = qline;
      break;
    }
    if (pos >= len) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushError('quote_junk');
    return junk;

    // A stretch inside a quoted field: each CRLF or lone CR in it is read as LF.
    function convertSegment(seg) {
      if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) return seg;
      const breaks = seg.match(/\r\n|\r|\n/g);
      qline += breaks === null ? 0 : breaks.length;
      return seg.replace(/\r\n?/g, '\n');
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record sits on one line with no quotes. A line's
    // only CR is its CRLF's; any other CR is a stray_cr, dropped.
    const lineEnd = text.indexOf('\n', pos);
    const segEnd = lineEnd === -1 ? len : lineEnd;
    const seg = text.slice(pos, segEnd);
    let fields = null;
    let quoted = false;
    if (seg.indexOf('"') === -1) {
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        fields = seg.split(',');
      } else if (lineEnd !== -1 && ri === seg.length - 1) {
        fields = seg.slice(0, -1).split(',');
      } else {
        let stray = 0;
        let body = '';
        for (let i = 0; i < seg.length; i++) {
          if (seg.charCodeAt(i) === 13) stray += 1;
          else body += seg[i];
        }
        if (lineEnd !== -1 && seg.charCodeAt(seg.length - 1) === 13) stray -= 1;
        fields = body.split(',');
        for (let k = 0; k < stray; k++) pushError('stray_cr');
      }
      pos = lineEnd === -1 ? len : lineEnd + 1;
      if (lineEnd !== -1) line += 1;
    }

    if (fields === null) {
      fields = [];
      let field;
      do {
        quoted = text.charCodeAt(pos) === 34;
        field = quoted ? readQuoted() : readUnquoted('');
        fields.push(field.value);
      } while (field.ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
