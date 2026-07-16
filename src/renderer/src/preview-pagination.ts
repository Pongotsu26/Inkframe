export const PREVIEW_PAGINATION_STYLES = `
table {
  display: table !important;
  overflow: visible !important;
}
thead {
  display: table-header-group;
}
tfoot {
  display: table-footer-group;
}
tbody {
  break-inside: auto;
  page-break-inside: auto;
}
tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
pre[data-split-to] {
  border-bottom: 0 !important;
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}
pre[data-split-from] {
  border-top: 0 !important;
  border-top-left-radius: 0 !important;
  border-top-right-radius: 0 !important;
}
`;

export const PREVIEW_PAGINATION_SCRIPT = `
class InkframeRepeatingTableHeaders extends window.Paged.Handler {
  constructor(chunker, polisher, caller) {
    super(chunker, polisher, caller);
    this.repeatedRows = [];
  }

  beforePageLayout(_page, _content, breakToken) {
    if (!breakToken?.node || breakToken.offset > 0) return;
    const element = breakToken.node.nodeType === Node.ELEMENT_NODE
      ? breakToken.node
      : breakToken.node.parentElement;
    const row = element?.closest('tr');
    const table = row?.closest('table');
    const header = table?.querySelector(':scope > thead');
    if (!row || !header || header.contains(row)) return;
    const repeatedRows = [...header.rows].map(headerRow => {
      const repeatedRow = headerRow.cloneNode(true);
      repeatedRow.dataset.inkframeRepeatedHeader = 'true';
      return repeatedRow;
    });
    if (!repeatedRows.length) return;
    row.before(...repeatedRows);
    breakToken.node = repeatedRows[0];
    breakToken.offset = 0;
    this.repeatedRows = repeatedRows;
  }

  afterPageLayout() {
    this.repeatedRows.forEach(row => row.remove());
    this.repeatedRows = [];
  }
}
window.Paged.registerHandlers(InkframeRepeatingTableHeaders);
`;
