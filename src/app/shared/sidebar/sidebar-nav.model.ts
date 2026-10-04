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
  // Catalog
  {
    label: 'Catalog',
    icon: 'bi-grid-3x3-gap',
    links: [
      { label: 'Categories', route: '/categories', icon: 'bi-tags' },
      { label: 'Brands', route: '/brands', icon: 'bi-award' },
      { label: 'Units', route: '/units', icon: 'bi-rulers' },
      { label: 'Products', route: '/products', icon: 'bi-box-seam' }
    ]
  },
  // Identity & Access
  {
    label: 'Identity & Access',
    icon: 'bi-shield-lock',
    links: [
      { label: 'Users', route: '/users', icon: 'bi-people' },
      { label: 'Roles', route: '/roles', icon: 'bi-person-badge' },
      { label: 'Permissions', route: '/permissions', icon: 'bi-key' }
    ]
  },
  // Tenancy
  {
    label: 'Tenancy',
    icon: 'bi-building',
    links: [
      { label: 'Tenants', route: '/tenants', icon: 'bi-diagram-3' },
      { label: 'Shops', route: '/shops', icon: 'bi-shop' },
      { label: 'Company Settings', route: '/company-settings', icon: 'bi-gear' }
    ]
  },
  // purchasing
  {
    label: 'Purchasing',
    icon: 'bi-truck',
    links: [
      { label: 'Suppliers', route: '/suppliers', icon: 'bi-building' },
      { label: 'Payment Methods', route: '/payment-methods', icon: 'bi-credit-card' },
      { label: 'Purchases', route: '/purchases', icon: 'bi-receipt' },
      { label: 'Purchase Returns', route: '/purchase-returns', icon: 'bi-arrow-return-left' },
      { label: 'Supplier Payments', route: '/supplier-payments', icon: 'bi-cash-stack' }
    ]
  },
  {
    label: 'Inventory',
    icon: 'bi-boxes',
    links: [
      { label: 'Stock On Hand', route: '/stock', icon: 'bi-clipboard-data' },
      { label: 'Stock Adjustments', route: '/stock-adjustments', icon: 'bi-clipboard-check' }
    ]
  }
];