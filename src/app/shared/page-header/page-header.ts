import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  templateUrl: './page-header.html',
  styleUrl: './page-header.css'
})
export class PageHeader {
  // Pass segments in order, e.g. ['Catalog', 'Categories'] or ['Catalog', 'Create Category']
  @Input({ required: true }) segments: string[] = [];
}