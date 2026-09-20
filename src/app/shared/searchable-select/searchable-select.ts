import { Component, Input, forwardRef, ElementRef, HostListener, signal, computed } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchableOption {
  id: number;
  label: string;
  sublabel?: string;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  templateUrl: './searchable-select.html',
  styleUrl: './searchable-select.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelect),
      multi: true
    }
  ]
})
export class SearchableSelect implements ControlValueAccessor {
  // Convert standard input into a reactive signal
  private readonly _options = signal<SearchableOption[]>([]);
  @Input() set options(value: SearchableOption[]) {
    this._options.set(value || []);
  }
  
  @Input() placeholder = 'Select...';

  readonly isOpen = signal(false);
  readonly search = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly disabled = signal(false);

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef) {}

  readonly filteredOptions = computed(() => {
    const term = this.search().trim().toLowerCase();
    const currentOptions = this._options(); // Track the signal
    
    if (!term) return currentOptions;
    return currentOptions.filter(
      (o) => o.label.toLowerCase().includes(term) || (o.sublabel ?? '').toLowerCase().includes(term)
    );
  });

  readonly selectedLabel = computed(() => {
    // Will now automatically re-evaluate as soon as options arrive from the API
    const selected = this._options().find((o) => o.id === this.selectedId());
    return selected ? selected.label : '';
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  toggleOpen(): void {
    if (this.disabled()) return;
    this.isOpen.update((v) => !v);
    if (this.isOpen()) this.search.set('');
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  select(option: SearchableOption): void {
    this.selectedId.set(option.id);
    this.onChange(option.id);
    this.onTouched();
    this.isOpen.set(false);
    this.search.set('');
  }

  writeValue(value: number | null): void {
    this.selectedId.set(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}