import { Component, inject } from '@angular/core';
import { AlertService } from './alert.service';

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  templateUrl: './alert-dialog.html',
  styleUrl: './alert-dialog.css'
})
export class AlertDialog {
  protected alertService = inject(AlertService);

  respond(value: string): void {
    this.alertService.respond(value);
  }
}