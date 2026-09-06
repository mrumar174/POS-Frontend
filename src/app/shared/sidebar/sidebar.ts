import { Component, effect, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SIDEBAR_GROUPS, SidebarGroup } from './sidebar-nav.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar {
  readonly groups: SidebarGroup[] = SIDEBAR_GROUPS;

  readonly collapsed = signal(false);

  // Only ONE group open at a time now — holds that group's label, or null.
  readonly expandedGroup = signal<string | null>(null);

  constructor(protected auth: AuthService, private router: Router) {
    // Auto-expand whichever group contains the currently active route,
    // and only that one — matches "expand the tab that's active" behavior.
    this.setExpandedGroupFromUrl(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.setExpandedGroupFromUrl(event.urlAfterRedirects));
  }

  private setExpandedGroupFromUrl(url: string): void {
    const match = this.groups.find((group) =>
      group.links.some((link) => url === link.route || url.startsWith(link.route + '/'))
    );
    this.expandedGroup.set(match?.label ?? null);
  }

  toggleSidebar(): void {
    this.collapsed.update((v) => !v);
  }

  toggleGroup(label: string): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
    }
    // Clicking the already-open group closes it; clicking a different
    // group closes whatever was open and opens only this one.
    this.expandedGroup.update((current) => (current === label ? null : label));
  }

  isGroupExpanded(label: string): boolean {
    return this.expandedGroup() === label;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}