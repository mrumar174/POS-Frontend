import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PageHeader } from '../../../../shared/page-header/page-header';
import { ReportBase } from '../report-base';
import { PresetKey, presetRange } from '../report-utils';

/**
 * Common frame for every report: breadcrumb, date range + presets, extra filters (projected),
 * Run / Excel / Print buttons, loading / error / empty states.
 *
 * Shortcuts: Ctrl+Enter = Run, Ctrl+E = Excel, Ctrl+P = Print
 */
@Component({
  selector: 'app-report-shell',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, PageHeader],
  templateUrl: './report-shell.html',
  styleUrls: ['./report-shell.css', '../report.css']
})
export class ReportShell {
  @Input({ required: true }) r!: ReportBase<any>;

  readonly presets: { key: PresetKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' },
    { key: 'year', label: 'This year' }
  ];

  get segments(): string[] { return ['Reports', this.r.title]; }

  applyPreset(key: PresetKey): void {
    const p = presetRange(key);
    this.r.form.patchValue({ fromDate: p.from, toDate: p.to });
    this.r.run();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') { e.preventDefault(); this.r.run(); }
    else if (k === 'e') { e.preventDefault(); this.r.exportExcel(); }
    else if (k === 'p') { e.preventDefault(); this.r.print(); }
  }
}
