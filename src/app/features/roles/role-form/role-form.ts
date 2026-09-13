import { Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Client, CreateRoleDto, UpdateRoleDto, PermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { PageHeader } from "../../../shared/page-header/page-header";

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './role-form.html',
  styleUrl: './role-form.css'
})
export class RoleForm implements OnInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);

  readonly loading = signal(false);
  readonly isEditMode = signal(false);
  readonly allPermissions = signal<PermissionDto[]>([]);
  readonly selectedPermissionIds = signal<Set<number>>(new Set());
  private roleId: number | null = null;

  form = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  ngOnInit(): void {
    this.client.permissionsAll(undefined).subscribe({
      next: (data) => this.allPermissions.set(data),
      error: () => this.notify.danger('Could not load the permission list.')
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.roleId = Number(idParam);
      this.isEditMode.set(true);
      this.loading.set(true);
      this.client.rolesGET(this.roleId).subscribe({
        next: (role) => {
          this.form.patchValue({ name: role.name, description: role.description ?? '' });
          // Role only returns permission NAMES, not IDs — match by name against allPermissions
          // once that list has loaded, since both calls fire in parallel.
          const names = new Set(role.permissions ?? []);
          const trySelect = () => {
            const matchedIds = this.allPermissions()
              .filter((p) => names.has(p.name!))
              .map((p) => p.id!);
            this.selectedPermissionIds.set(new Set(matchedIds));
          };
          if (this.allPermissions().length) trySelect();
          else setTimeout(trySelect, 300); // simple wait for the parallel call above
          this.loading.set(false);
        },
        error: () => {
          this.notify.danger('Could not load this role.');
          this.loading.set(false);
        }
      });
    }
  }

  togglePermission(id: number, checked: boolean): void {
    this.selectedPermissionIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  isChecked(id: number): boolean {
    return this.selectedPermissionIds().has(id);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.name.hasError('required')) {
        this.notify.warning('Name is required.');
      }
      return;
    }

    this.loading.set(true);
    const v = this.form.getRawValue();
    const permissionIds = Array.from(this.selectedPermissionIds());

    const request$ = this.isEditMode()
      ? this.client.rolesPUT(this.roleId!, new UpdateRoleDto({ id: this.roleId!, name: v.name!, description: v.description || undefined, permissionIds }))
      : this.client.rolesPOST(new CreateRoleDto({ name: v.name!, description: v.description || undefined, permissionIds }));

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.notify.success(this.isEditMode() ? 'Role updated successfully.' : 'Role created successfully.');
        this.router.navigate(['/roles']);
      },
      error: (err) => {
        this.loading.set(false);
        const message = typeof err.error === 'string' ? err.error : 'Could not save this role.';
        this.notify.danger(message);
      }
    });
  }
}