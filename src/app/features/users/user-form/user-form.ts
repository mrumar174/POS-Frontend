import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateUserDto, UpdateUserDto, RoleDto, ShopDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './user-form.html'
})
export class UserForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly isEditMode = signal(false);
  readonly allRoles = signal<RoleDto[]>([]);
  readonly allShops = signal<ShopDto[]>([]);
  readonly selectedRoleIds = signal<Set<number>>(new Set());
  readonly selectedShopIds = signal<Set<number>>(new Set());
  private userId: number | null = null;

  form = this.fb.group({
    userName: ['', Validators.required],
    fullName: ['', Validators.required],
    password: [''],
    contactNo: [''],
    address: ['']
  });

  ngOnInit(): void {
    this.client.rolesAll().subscribe({ next: (data) => this.allRoles.set(data) });
    this.client.shopsAll().subscribe({ next: (data) => this.allShops.set(data) });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.userId = Number(idParam);
      this.isEditMode.set(true);
      // Password not required when editing.
      this.form.get('password')?.clearValidators();
      this.loading.set(true);
      this.client.usersGET(this.userId).subscribe({
        next: (user) => {
          this.form.patchValue({
            userName: user.userName,
            fullName: user.fullName,
            contactNo: user.contactNo ?? '',
            address: user.address ?? ''
          });
          this.selectedShopIds.set(new Set(user.shopIds ?? []));
          // UserDto only returns role NAMES — match against allRoles once loaded.
          const names = new Set(user.roles ?? []);
          const trySelectRoles = () => {
            const matchedIds = this.allRoles().filter((r) => names.has(r.name!)).map((r) => r.id!);
            this.selectedRoleIds.set(new Set(matchedIds));
          };
          if (this.allRoles().length) trySelectRoles();
          else setTimeout(trySelectRoles, 300);
          this.loading.set(false);
        },
        error: () => {
          this.notify.danger('Could not load this user.');
          this.loading.set(false);
        }
      });
    } else {
      this.form.get('password')?.addValidators([Validators.required, Validators.minLength(6)]);
    }
  }

  toggleRole(id: number, checked: boolean): void {
    this.selectedRoleIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  toggleShop(id: number, checked: boolean): void {
    this.selectedShopIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  isRoleChecked(id: number): boolean {
    return this.selectedRoleIds().has(id);
  }

  isShopChecked(id: number): boolean {
    return this.selectedShopIds().has(id);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.userName.hasError('required')) {
        this.notify.warning('Username is required.');
      } else if (this.form.controls.fullName.hasError('required')) {
        this.notify.warning('Full name is required.');
      } else if (this.form.controls.password.hasError('required')) {
        this.notify.warning('Password is required.');
      } else if (this.form.controls.password.hasError('minlength')) {
        this.notify.warning('Password must be at least 6 characters.');
      }
      return;
    }

    this.loading.set(true);
    const v = this.form.getRawValue();
    const roleIds = Array.from(this.selectedRoleIds());
    const shopIds = Array.from(this.selectedShopIds());

    const request$ = this.isEditMode()
      ? this.client.usersPUT(this.userId!, new UpdateUserDto({
          id: this.userId!,
          userName: v.userName!,
          fullName: v.fullName!,
          contactNo: v.contactNo || undefined,
          address: v.address || undefined,
          roleIds,
          shopIds
        }))
      : this.client.usersPOST(new CreateUserDto({
          userName: v.userName!,
          fullName: v.fullName!,
          password: v.password!,
          contactNo: v.contactNo || undefined,
          address: v.address || undefined,
          roleIds,
          shopIds
        }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'User updated successfully.' : 'User created successfully.');
        this.router.navigate(['/users']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not save this user.';
        this.notify.danger(message);
      }
    });
  }
}