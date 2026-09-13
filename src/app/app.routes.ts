import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Auth
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./features/auth/login/login').then((m) => m.Login) },
  { path: 'signup', loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup) },
  // Category
  { path: 'categories', canActivate: [authGuard], loadComponent: () => import('./features/categories/category-list/category-list').then((m) => m.CategoryList) },
  { path: 'categories/new', canActivate: [authGuard], loadComponent: () => import('./features/categories/category-form/category-form').then((m) => m.CategoryForm) },
  { path: 'categories/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/categories/category-form/category-form').then((m) => m.CategoryForm) },
  // Shops
  { path: 'shops', canActivate: [authGuard], loadComponent: () => import('./features/shops/shop-list/shop-list').then((m) => m.ShopList) },
  { path: 'shops/new', canActivate: [authGuard], loadComponent: () => import('./features/shops/shop-form/shop-form').then((m) => m.ShopForm) },
  { path: 'shops/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/shops/shop-form/shop-form').then((m) => m.ShopForm) },
  // Permissions
  { path: 'permissions', canActivate: [authGuard], loadComponent: () => import('./features/permissions/permission-list/permission-list').then((m) => m.PermissionList) },
  { path: 'permissions/new', canActivate: [authGuard], loadComponent: () => import('./features/permissions/permission-form/permission-form').then((m) => m.PermissionForm) },
  // Roles
  { path: 'roles', canActivate: [authGuard], loadComponent: () => import('./features/roles/role-list/role-list').then((m) => m.RoleList) },
  { path: 'roles/new', canActivate: [authGuard], loadComponent: () => import('./features/roles/role-form/role-form').then((m) => m.RoleForm) },
  { path: 'roles/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/roles/role-form/role-form').then((m) => m.RoleForm) },
  // Users
  { path: 'users', canActivate: [authGuard], loadComponent: () => import('./features/users/user-list/user-list').then((m) => m.UserList) },
  { path: 'users/new', canActivate: [authGuard], loadComponent: () => import('./features/users/user-form/user-form').then((m) => m.UserForm) },
  { path: 'users/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/users/user-form/user-form').then((m) => m.UserForm) },
  // Tenants
  { path: 'tenants', canActivate: [authGuard], loadComponent: () => import('./features/tenants/tenant-list/tenant-list').then((m) => m.TenantList) },
  { path: 'tenants/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/tenants/tenant-form/tenant-form').then((m) => m.TenantForm) },
  // Brands
  { path: 'brands', canActivate: [authGuard], loadComponent: () => import('./features/brands/brand-list/brand-list').then((m) => m.BrandList) },
  { path: 'brands/new', canActivate: [authGuard], loadComponent: () => import('./features/brands/brand-form/brand-form').then((m) => m.BrandForm) },
  { path: 'brands/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/brands/brand-form/brand-form').then((m) => m.BrandForm) },
  // Units
  { path: 'units', canActivate: [authGuard], loadComponent: () => import('./features/units/unit-list/unit-list').then((m) => m.UnitList) },
  { path: 'units/new', canActivate: [authGuard], loadComponent: () => import('./features/units/unit-form/unit-form').then((m) => m.UnitForm) },
  { path: 'units/:id/edit', canActivate: [authGuard], loadComponent: () => import('./features/units/unit-form/unit-form').then((m) => m.UnitForm) },
  { path: '**', redirectTo: 'login' }
];