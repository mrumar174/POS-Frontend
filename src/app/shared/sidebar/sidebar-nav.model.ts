export interface SidebarLink {
  label: string;
  route: string;
  icon: string;
}

export interface SidebarGroup {
  label: string;
  icon: string;
  links: SidebarLink[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Catalog',
    icon: 'bi-grid-3x3-gap',
    links: [
      { label: 'Categories', route: '/categories', icon: 'bi-tags' },
      { label: 'Brands', route: '/brands', icon: 'bi-award' },
      { label: 'Units', route: '/units', icon: 'bi-rulers' }
    ]
  },
  {
    label: 'Identity & Access',
    icon: 'bi-shield-lock',
    links: [
      { label: 'Users', route: '/users', icon: 'bi-people' },
      { label: 'Roles', route: '/roles', icon: 'bi-person-badge' },
      { label: 'Permissions', route: '/permissions', icon: 'bi-key' }
    ]
  },
  {
    label: 'Tenancy',
    icon: 'bi-building',
    links: [
      { label: 'Tenants', route: '/tenants', icon: 'bi-diagram-3' },
      { label: 'Shops', route: '/shops', icon: 'bi-shop' }
    ]
  }
];