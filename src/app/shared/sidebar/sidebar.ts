import { Component, signal } from '@angular/core';
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
  readonly expandedGroup = signal<string | null>(null);
  readonly expandedSubGroup = signal<string | null>(null);

  constructor(protected auth: AuthService, private router: Router) {
    this.setExpandedGroupFromUrl(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.setExpandedGroupFromUrl(event.urlAfterRedirects));
  }

  private isMatch(currentUrl: string, linkRoute: string): boolean {
    // Reports overview must be an exact match so it doesn't swallow all other /reports/* sub-routes
    if (linkRoute === '/reports') {
      return currentUrl === '/reports' || currentUrl === '/reports/';
    }
    return currentUrl === linkRoute || currentUrl.startsWith(linkRoute + '/');
  }

  private setExpandedGroupFromUrl(url: string): void {
    let matchedGroup: SidebarGroup | null = null;
    let matchedSubGroup: any = null;

    for (const group of this.groups) {
      if (group.children) {
        for (const sub of group.children) {
          // Sort links by length descending so specific routes are checked before generic ones
          const sortedLinks = [...sub.links].sort((a, b) => b.route.length - a.route.length);
          const found = sortedLinks.some((link) => this.isMatch(url, link.route));
          if (found) {
            matchedGroup = group;
            matchedSubGroup = sub;
            break;
          }
        }
      } else if (group.links) {
        const sortedLinks = [...group.links].sort((a, b) => b.route.length - a.route.length);
        const found = sortedLinks.some((link) => this.isMatch(url, link.route));
        if (found) {
          matchedGroup = group;
          break;
        }
      }
      if (matchedGroup) break;
    }

    this.expandedGroup.set(matchedGroup?.label ?? null);
    this.expandedSubGroup.set(matchedSubGroup?.label ?? null);
  }

  toggleSidebar(): void {
    this.collapsed.update((v) => !v);
  }

  toggleGroup(label: string): void {
    if (this.collapsed()) {
      this.collapsed.set(false);
    }
    this.expandedGroup.update((current) => (current === label ? null : label));
  }

  isGroupExpanded(label: string): boolean {
    return this.expandedGroup() === label;
  }

  toggleSubGroup(label: string): void {
    this.expandedSubGroup.update((current) => (current === label ? null : label));
  }

  isSubGroupExpanded(label: string): boolean {
    return this.expandedSubGroup() === label;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}