export interface SidebarLink {
  label: string;
  route: string;
  icon: string;
}

export interface SidebarSubGroup {
  label: string;
  icon: string;
  links: SidebarLink[];
}

export interface SidebarGroup {
  label: string;
  icon: string;
  links?: SidebarLink[];
  children?: SidebarSubGroup[]; // For nested report sub-categories
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Overview',
    icon: 'bi-speedometer2',
    links: [
      { label: 'Dashboard', route: '/dashboard', icon: 'bi-speedometer2' }
    ]
  },
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
      { label: 'Shops', route: '/shops', icon: 'bi-shop' },
      { label: 'Company Settings', route: '/company-settings', icon: 'bi-gear' }
    ]
  },
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
  {
    label: 'Sales',
    icon: 'bi-cart',
    links: [
      { label: 'New Sale (POS)', route: '/sales/new', icon: 'bi-cart-plus' },
      { label: 'Sales History', route: '/sales', icon: 'bi-receipt' },
      { label: 'Sale Returns', route: '/sale-returns', icon: 'bi-arrow-return-left' }
    ]
  },
  {
    label: 'Finance',
    icon: 'bi-wallet2',
    links: [
      { label: 'Expense Categories', route: '/expense-categories', icon: 'bi-tags' },
      { label: 'Expenses', route: '/expenses', icon: 'bi-wallet2' },
      { label: 'Daily Cash Closing', route: '/cash-closing', icon: 'bi-calculator' }
    ]
  },
  // Single Unified Reports Tab with nested children
  {
    label: 'Reports',
    icon: 'bi-graph-up-arrow',
    children: [
      {
        label: 'Sales Reports',
        icon: 'bi-graph-up-arrow',
        links: [
          { label: 'Reports Overview', route: '/reports', icon: 'bi-grid' },
          { label: 'Sales Summary', route: '/reports/sales-summary', icon: 'bi-bar-chart-line' },
          { label: 'Sales by Product', route: '/reports/sales-by-product', icon: 'bi-box-seam' },
          { label: 'Sales by Category', route: '/reports/sales-by-category', icon: 'bi-tags' },
          { label: 'Profit Report', route: '/reports/profit', icon: 'bi-graph-up' },
          { label: 'Cashier Performance', route: '/reports/cashier-performance', icon: 'bi-person-check' }
        ]
      },
      {
        label: 'Purchase Reports',
        icon: 'bi-truck',
        links: [
          { label: 'Purchase Summary', route: '/reports/purchase-summary', icon: 'bi-receipt' },
          { label: 'Purchases by Supplier', route: '/reports/purchases-by-supplier', icon: 'bi-building' },
          { label: 'Supplier Dues', route: '/reports/supplier-dues', icon: 'bi-hourglass-split' }
        ]
      },
      {
        label: 'Inventory Reports',
        icon: 'bi-boxes',
        links: [
          { label: 'Stock Valuation', route: '/reports/stock-valuation', icon: 'bi-cash-coin' },
          { label: 'Stock Movement', route: '/reports/stock-movement', icon: 'bi-arrow-left-right' },
          { label: 'Low Stock', route: '/reports/low-stock', icon: 'bi-exclamation-triangle' }
        ]
      },
      {
        label: 'Finance Reports',
        icon: 'bi-wallet2',
        links: [
          { label: 'Tax Report', route: '/reports/tax', icon: 'bi-percent' },
          { label: 'Expenses Report', route: '/reports/expenses', icon: 'bi-cash-stack' }
        ]
      }
    ]
  }
];