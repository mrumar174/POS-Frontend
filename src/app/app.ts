import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './shared/sidebar/sidebar';
import { NotificationContainer } from './shared/notification/notification-container';
import { AlertDialog } from './shared/alert/alert-dialog';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Sidebar, NotificationContainer, AlertDialog],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}