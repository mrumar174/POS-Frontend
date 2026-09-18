import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Client, CreateRoleDto, UpdateRoleDto, PermissionDto } from '../../../core/api/api-client';
import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';
import { PageHeader } from '../../../shared/page-header/page-header';

interface PermissionGroup {
  module: string;
  permissions: PermissionDto[];
}

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 300;

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './role-form.html',
  styleUrl: './role-form.css'
})
export class RoleForm implements OnInit, AfterViewInit {
  private fb = inject(FormBuilder);
  private client = inject(Client);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(false);   // initial load (edit mode + permission fetch)
  readonly saving = signal(false);    // submit in progress
  readonly errorMessage = signal<string | null>(null);
  readonly isEditMode = signal(false);

  readonly allPermissions = signal<PermissionDto[]>([]);
  readonly selectedPermissionIds = signal<Set<number>>(new Set());

  private roleId: number | null = null;

  readonly nameMaxLength = NAME_MAX_LENGTH;
  readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]]
  });

  // Group permissions by module so the picker reads like a checklist per
  // feature area, instead of one long flat list.
  readonly permissionGroups = computed<PermissionGroup[]>(() => {
    const groups = new Map<string, PermissionDto[]>();
    for (const p of this.allPermissions()) {
      const module = p.module ?? 'Other';
      if (!groups.has(module)) groups.set(module, []);
      groups.get(module)!.push(p);
    }
    return Array.from(groups.entries())
      .map(([module, permissions]) => ({ module, permissions }))
      .sort((a, b) => a.module.localeCompare(b.module));
  });

  readonly selectedCount = computed(() => this.selectedPermissionIds().size);
  readonly totalCount = computed(() => this.allPermissions().length);

  get breadcrumbSegments(): string[] {
    return ['Identity & Access', this.isEditMode() ? 'Edit Role' : 'Create Role'];
  }

  get nameControl() {
    return this.form.controls.name;
  }

  get descriptionControl() {
    return this.form.controls.description;
  }

  ngOnInit(): void {
    this.loading.set(true);

    this.client.permissionsAll(undefined).subscribe({
      next: (data) => this.allPermissions.set(data),
      error: () => this.notify.danger('Could not load the permission list.')
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.roleId = Number(idParam);
      this.isEditMode.set(true);

      this.client.rolesGET(this.roleId).subscribe({
        next: (role) => {
          this.form.patchValue({ name: role.name, description: role.description ?? '' });

          // Role only returns permission NAMES, not IDs — match by name
          // against allPermissions once that list has loaded, since both
          // calls fire in parallel.
          const names = new Set(role.permissions ?? []);
          const trySelect = () => {
            const matchedIds = this.allPermissions()
              .filter((p) => names.has(p.name!))
              .map((p) => p.id!);
            this.selectedPermissionIds.set(new Set(matchedIds));
          };
          if (this.allPermissions().length) trySelect();
          else setTimeout(trySelect, 300);

          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load this role.');
          this.notify.danger('Could not load this role.');
          this.loading.set(false);
        }
      });
    } else {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    if (!this.isEditMode()) {
      this.nameInput?.nativeElement.focus();
    }
  }

  togglePermission(id: number, checked: boolean): void {
    this.selectedPermissionIds.update((set) => {
      const next = new Set(set);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
    this.form.markAsDirty();
  }

  isChecked(id: number): boolean {
    return this.selectedPermissionIds().has(id);
  }

  isModuleFullySelected(group: PermissionGroup): boolean {
    return group.permissions.every((p) => this.isChecked(p.id!));
  }

  toggleModule(group: PermissionGroup): void {
    const allSelected = this.isModuleFullySelected(group);
    this.selectedPermissionIds.update((set) => {
      const next = new Set(set);
      for (const p of group.permissions) {
        allSelected ? next.delete(p.id!) : next.add(p.id!);
      }
      return next;
    });
    this.form.markAsDirty();
  }

  submit(): void {
    const trimmedName = (this.nameControl.value ?? '').trim();
    const trimmedDescription = (this.descriptionControl.value ?? '').trim();
    this.form.patchValue({ name: trimmedName, description: trimmedDescription }, { emitEvent: false });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.nameInput?.nativeElement.focus();

      if (this.nameControl.hasError('required')) {
        this.notify.warning('Name is required.');
      } else if (this.nameControl.hasError('maxlength')) {
        this.notify.warning(`Name cannot exceed ${this.nameMaxLength} characters.`);
      } else if (this.descriptionControl.hasError('maxlength')) {
        this.notify.warning(`Description cannot exceed ${this.descriptionMaxLength} characters.`);
      }
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);
    const permissionIds = Array.from(this.selectedPermissionIds());

    const request$ = this.isEditMode()
      ? this.client.rolesPUT(this.roleId!, new UpdateRoleDto({ id: this.roleId!, name: trimmedName, description: trimmedDescription || undefined, permissionIds }))
      : this.client.rolesPOST(new CreateRoleDto({ name: trimmedName, description: trimmedDescription || undefined, permissionIds }));

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notify.success(this.isEditMode() ? 'Role updated successfully.' : 'Role created successfully.');
        this.router.navigate(['/roles']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = typeof err.error === 'string' ? err.error : err.error?.message ?? 'Could not save this role.';
        this.errorMessage.set(message);
        this.notify.danger(message);
      }
    });
  }

  async cancel(): Promise<void> {
    if (this.form.dirty) {
      const confirmed = await this.alert.confirm(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?'
      );
      if (!confirmed) return;
    }
    this.router.navigate(['/roles']);
  }
}