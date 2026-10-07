import { Component, Input, ViewChild, ElementRef, OnChanges, AfterViewInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-barcode-render',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="barcode-label-content">
      <div class="label-name text-truncate">{{ productName }}</div>
      <svg #svgEl class="barcode-svg"></svg>
      <div class="label-price">Rs. {{ price | number:'1.2-2' }}</div>
    </div>
  `,
  styles: [`
    .barcode-label-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #fff;
      box-sizing: border-box;
      padding: 2mm;
      overflow: hidden;
    }
    .label-name {
      font-size: 10px;
      font-weight: 700;
      color: #000;
      text-transform: uppercase;
      max-width: 95%;
      margin-bottom: 1px;
    }
    .barcode-svg {
      max-width: 100%;
      height: auto;
    }
    .label-price {
      font-size: 11px;
      font-weight: 800;
      color: #000;
      margin-top: 1px;
    }
  `]
})
export class BarcodeRender implements OnChanges, AfterViewInit {
  @Input({ required: true }) value!: string;
  @Input({ required: true }) productName!: string;
  @Input({ required: true }) price!: number;
  @Input() format: string = 'CODE128';

  @ViewChild('svgEl') svgEl?: ElementRef<SVGElement>;

  ngAfterViewInit() { this.renderBarcode(); }
  ngOnChanges() { if (this.svgEl) this.renderBarcode(); }

  private renderBarcode() {
    if (!this.svgEl || !this.value) return;
    try {
      JsBarcode(this.svgEl.nativeElement, this.value, {
        format: this.format,
        width: 1.5,
        height: 35,
        displayValue: true,
        fontSize: 12,
        margin: 0,
        textMargin: 2
      });
    } catch (e) {
      console.error('Invalid barcode value for format', this.format, this.value);
    }
  }
}