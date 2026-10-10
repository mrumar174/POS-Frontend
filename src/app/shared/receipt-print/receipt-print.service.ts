import { Injectable } from '@angular/core';
import { SaleDto, CompanySettingsDto } from '../../core/api/api-client';

@Injectable({ providedIn: 'root' })
export class ReceiptPrintService {

  print(sale: SaleDto, company: CompanySettingsDto | null): void {
    const html = this.buildHtml(sale, company);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow!;
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the logo (if any) so it doesn't print blank
    const imgs = Array.from(doc.images);
    const loaded = Promise.all(
      imgs.map(img => img.complete
        ? Promise.resolve()
        : new Promise<void>(res => { img.onload = img.onerror = () => res(); }))
    );

    Promise.race([loaded, new Promise(res => setTimeout(res, 1500))]).then(() => {
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    });
  }

  private esc(v: unknown): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private n(v: number | undefined | null, dp = 2): string {
    return (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  private qty(v: number | undefined | null): string {
    return (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
  }

  private buildHtml(s: SaleDto, c: CompanySettingsDto | null): string {
    const cur = this.esc(c?.currency ?? '');
    const date = s.saleDate ? new Date(s.saleDate).toLocaleDateString('en-GB') : '';
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const rows = (s.items ?? []).map(i => `
      <tr><td colspan="3" class="name">${this.esc(i.productName)}</td></tr>
      <tr>
        <td>${this.qty(i.quantity)} x ${this.n(i.salePrice)}</td>
        <td class="r">${(i.discount ?? 0) > 0 ? '-' + this.n(i.discount) : ''}</td>
        <td class="r">${this.n(i.total)}</td>
      </tr>`).join('');

    const line = (label: string, value: string, bold = false) =>
      `<div class="sum ${bold ? 'bold' : ''}"><span>${label}</span><span>${value}</span></div>`;

    return `<!doctype html><html><head><meta charset="utf-8"><title>${this.esc(s.invoiceNo)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 3mm 0; font: 12px/1.35 'Courier New', monospace; color: #000; }
  .c { text-align: center; } .r { text-align: right; } .bold { font-weight: 700; }
  .logo { max-width: 40mm; max-height: 20mm; margin-bottom: 2mm; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .muted { font-size: 11px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 11px; text-align: left; border-bottom: 1px dashed #000; padding-bottom: 2px; }
  td { padding: 0; vertical-align: top; }
  td.name { padding-top: 3px; font-weight: 700; }
  .sum { display: flex; justify-content: space-between; }
  .grand { font-size: 15px; font-weight: 700; }
  .pre { white-space: pre-line; }
</style></head><body>
  <div class="c">
    ${c?.logoPath ? `<img class="logo" src="${this.esc(c.logoPath)}" alt="">` : ''}
    <h1>${this.esc(c?.companyName)}</h1>
    ${c?.address ? `<div class="muted pre">${this.esc(c.address)}</div>` : ''}
    ${c?.contactNo ? `<div class="muted">Tel: ${this.esc(c.contactNo)}</div>` : ''}
    ${c?.taxNumber ? `<div class="muted">Tax No: ${this.esc(c.taxNumber)}</div>` : ''}
    ${c?.receiptHeader ? `<div class="muted pre" style="margin-top:3px">${this.esc(c.receiptHeader)}</div>` : ''}
  </div>
  <hr>
  ${line('Invoice:', this.esc(s.invoiceNo), true)}
  ${line('Date:', `${date} ${time}`)}
  ${s.customerName ? line('Customer:', this.esc(s.customerName)) : ''}
  <hr>
  <table>
    <thead><tr><th>Qty x Price</th><th class="r">Disc</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr>
  ${line('Sub total', this.n(s.subTotal))}
  ${(s.discount ?? 0) > 0 ? line('Discount', '-' + this.n(s.discount)) : ''}
  ${(s.tax ?? 0) > 0 ? line('Tax', this.n(s.tax)) : ''}
  <hr>
  <div class="sum grand"><span>TOTAL</span><span>${cur} ${this.n(s.grandTotal)}</span></div>
  <hr>
  ${s.paymentMethodName ? line('Payment', this.esc(s.paymentMethodName)) : ''}
  ${line('Paid', this.n(s.paidAmount))}
  ${(s.changeAmount ?? 0) > 0 ? line('Change', this.n(s.changeAmount), true) : ''}
  ${(s.dueAmount ?? 0) > 0 ? line('Due', this.n(s.dueAmount), true) : ''}
  ${s.remarks ? `<hr><div class="muted pre">${this.esc(s.remarks)}</div>` : ''}
  <hr>
  <div class="c muted pre">${this.esc(c?.receiptFooter || 'Thank you for shopping with us!')}</div>
</body></html>`;
  }
}