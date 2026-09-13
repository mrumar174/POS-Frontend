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
    icon: '📁',
    links: [
      { label: 'Categories', route: '/categories', icon: '📂' },
      { label: 'Brands', route: '/brands', icon: '🏷️' },
      { label: 'Units', route: '/units', icon: '📏' }
    ]
  },
  {
    label: 'Identity & Access',
    icon: '🔐',
    links: [
      { label: 'Users', route: '/users', icon: '👤' },
      { label: 'Roles', route: '/roles', icon: '🛡️' },
      { label: 'Permissions', route: '/permissions', icon: '🔑' }
    ]
  },
  {
    label: 'Tenancy',
    icon: '🏢',
    links: [
      { label: 'Tenants', route: '/tenants', icon: '🏬' },
      { label: 'Shops', route: '/shops', icon: '🏪' }
    ]
  }
];