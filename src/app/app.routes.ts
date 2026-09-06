import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./features/auth/login/login').then((m) => m.Login) },
  { path: 'signup', loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup) },
  {
    path: 'categories',
    canActivate: [authGuard],
    loadComponent: () => import('./features/categories/category-list/category-list').then((m) => m.CategoryList)
  },
  {
    path: 'categories/new',
    canActivate: [authGuard],
    loadComponent: () => import('./features/categories/category-form/category-form').then((m) => m.CategoryForm)
  },
  {
    path: 'categories/:id/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./features/categories/category-form/category-form').then((m) => m.CategoryForm)
  },
  { path: '**', redirectTo: 'login' }
];