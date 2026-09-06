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
    links: [{ label: 'Categories', route: '/categories', icon: '📂' }]
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