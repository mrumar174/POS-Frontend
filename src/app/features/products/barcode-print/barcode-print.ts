import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Client, ProductDto, ProductBarcodeLabelDto,IProductDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from '../../../shared/page-header/page-header';
import { BarcodeRender } from '../../../shared/barcode-render/barcode-render';
interface PrintQueueItem {
  uid: string;
  productId: number;
  productName: string;
  price: number;
  barcodeValue: string;
}

interface ProductSelection extends IProductDto {
  copies: number;
  selected: boolean;
}

@Component({
  selector: 'app-barcode-print',
  standalone: true,
  imports: [PageHeader, FormsModule, BarcodeRender],
  templateUrl: './barcode-print.html',
  styleUrl: './barcode-print.css'
})
export class BarcodePrint implements OnInit {
  private client = inject(Client);
  private notify = inject(NotificationService);
  private route = inject(ActivatedRoute);

  readonly products = signal<ProductSelection[]>([]);
  readonly loading = signal(true);
  readonly generatingId = signal<number | null>(null);
  
  readonly globalSearch = signal('');
  readonly filteredProducts = computed(() => {
    const search = this.globalSearch().trim().toLowerCase();
    if (!search) return this.products();
    return this.products().filter(p => 
      (p.name?.toLowerCase().includes(search)) || 
      (p.productCode?.toLowerCase().includes(search))
    );
  });

  readonly presets = [
    { id: 'small', label: 'Small (40x25mm)', css: 'preset-small' },
    { id: 'medium', label: 'Medium (50x30mm)', css: 'preset-medium' },
    { id: 'large', label: 'Large (60x40mm)', css: 'preset-large' }
  ];
  readonly selectedPreset = signal(this.presets[0]);
  readonly showBorder = signal(true);

  readonly printQueue = signal<PrintQueueItem[]>([]);

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.client.productsAll().subscribe({
      next: (data) => {
        this.products.set(data.map(p => ({ ...p, copies: 1, selected: false })));
        this.loading.set(false);
        this.checkRouteParams();
      },
      error: () => {
        this.notify.danger('Could not load products.');
        this.loading.set(false);
      }
    });
  }

  private checkRouteParams(): void {
    const idParam = this.route.snapshot.queryParamMap.get('productId');
    if (idParam) {
      const pId = Number(idParam);
      const match = this.products().find(p => p.id === pId);
      if (match) {
        match.selected = true;
        this.globalSearch.set(match.productCode || '');
      }
    }
  }

  onGlobalSearch(event: Event): void {
    this.globalSearch.set((event.target as HTMLInputElement).value);
  }

  clearGlobalSearch(): void {
    this.globalSearch.set('');
  }

  toggleSelection(p: ProductSelection): void {
    p.selected = !p.selected;
  }

  generateBarcode(product: ProductSelection): void {
    this.generatingId.set(product.id!);
    this.client.generateBarcode(product.id!).subscribe({
      next: (updatedProduct) => {
        this.products.update(list => {
          const idx = list.findIndex(x => x.id === product.id);
          if (idx !== -1) {
            list[idx].barcodes = updatedProduct.barcodes;
          }
          return [...list];
        });
        this.generatingId.set(null);
        this.notify.success(`Barcode generated for ${product.name}`);
      },
      error: (err: any) => {
        this.generatingId.set(null);
        const msg = err.response ? JSON.parse(err.response).message : 'Failed to generate barcode.';
        this.notify.danger(msg);
      }
    });
  }

  addToQueue(): void {
    const selected = this.products().filter(p => p.selected);
    if (selected.length === 0) {
      this.notify.warning('Select at least one product.');
      return;
    }

    const invalid = selected.find(p => !p.barcodes || p.barcodes.length === 0);
    if (invalid) {
      this.notify.warning(`Product "${invalid.name}" has no barcode. Generate one first.`);
      return;
    }

    const productIds = selected.map(p => p.id!);
    
    // Call the minimal DTO endpoint
    this.client.barcodeLabels(productIds).subscribe({
      next: (labels: ProductBarcodeLabelDto[]) => {
        const newQueueItems: PrintQueueItem[] = [];

        for (const sel of selected) {
          const labelData = labels.find(l => l.productId === sel.id);
          if (!labelData || !labelData.barcodes || labelData.barcodes.length === 0) continue;

          // Pick the first barcode available for printing
          const barcodeVal = labelData.barcodes[0];

          for (let i = 0; i < sel.copies; i++) {
            newQueueItems.push({
              uid: `${sel.id}-${Date.now()}-${i}`,
              productId: sel.id!,
              productName: labelData.productName!,
              price: labelData.salePrice!,
              barcodeValue: barcodeVal
            });
          }
        }

        this.printQueue.update(q => [...q, ...newQueueItems]);
        
        // Uncheck all after adding
        this.products.update(list => {
          list.forEach(p => p.selected = false);
          return [...list];
        });
        
        this.notify.success(`Added ${newQueueItems.length} labels to the print queue.`);
      },
      error: () => this.notify.danger('Failed to fetch label data.')
    });
  }

  removeFromQueue(index: number): void {
    this.printQueue.update(q => {
      q.splice(index, 1);
      return [...q];
    });
  }

  clearQueue(): void {
    this.printQueue.set([]);
  }

  print(): void {
    if (this.printQueue().length === 0) {
      this.notify.warning('Print queue is empty.');
      return;
    }
    window.print();
  }
}