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
    label: 'Overview',
    icon: 'bi-speedometer2',
    links: [
      { label: 'Dashboard', route: '/dashboard', icon: 'bi-speedometer2' }
    ]
  },
  // Catalog
  {
    label: 'Catalog',
    icon: 'bi-grid-3x3-gap',
    links: [
      { label: 'Categories', route: '/categories', icon: 'bi-tags' },
      { label: 'Brands', route: '/brands', icon: 'bi-award' },
      { label: 'Units', route: '/units', icon: 'bi-rulers' },
      { label: 'Products', route: '/products', icon: 'bi-box-seam' },
      { label: 'Print Barcodes', route: '/products/barcode-print', icon: 'bi-upc-scan' },
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
  },
  // Sales
  {
    label: 'Sales',
    icon: 'bi-cart',
    links: [
      { label: 'New Sale (POS)', route: '/sales/new', icon: 'bi-cart-plus' },
      { label: 'Sales History', route: '/sales', icon: 'bi-receipt' },
      { label: 'Sale Returns', route: '/sale-returns', icon: 'bi-arrow-return-left' }
    ]
  },
    // Finance
  {
    label: 'Finance',
    icon: 'bi-wallet2',
    links: [
      { label: 'Expense Categories', route: '/expense-categories', icon: 'bi-tags' },
      { label: 'Expenses', route: '/expenses', icon: 'bi-wallet2' },
      { label: 'Daily Cash Closing', route: '/cash-closing', icon: 'bi-calculator' }
    ]
  },
];