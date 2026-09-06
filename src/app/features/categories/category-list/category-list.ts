import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Client, CategoryDto } from '../../../core/api/api-client';

import { NotificationService } from '../../../shared/notification/notification.service';
import { AlertService } from '../../../shared/alert/alert.service';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './category-list.html',
  styleUrl: './category-list.css'
})
export class CategoryList implements OnInit {

  private client = inject(Client);
  private notify = inject(NotificationService);
  private alert = inject(AlertService);


  // =========================================================
  // DATA
  // =========================================================

  readonly categories = signal<CategoryDto[]>([]);

  readonly loading = signal(true);

  readonly errorMessage = signal<string | null>(null);


  // =========================================================
  // FILTERS
  // =========================================================

  // Global search
  readonly globalSearch = signal('');

  // Column filters
  readonly nameFilter = signal('');

  readonly descriptionFilter = signal('');


  // Advance filter visibility
  readonly showAdvanceFilter = signal(false);


  // =========================================================
  // FILTERED CATEGORIES
  // =========================================================

  readonly filteredCategories = computed(() => {

    const categories = this.categories();

    const global = this.globalSearch()
      .trim()
      .toLowerCase();

    const name = this.nameFilter()
      .trim()
      .toLowerCase();

    const description = this.descriptionFilter()
      .trim()
      .toLowerCase();


    return categories.filter(category => {

      const categoryName =
        (category.name ?? '').toLowerCase();

      const categoryDescription =
        (category.description ?? '').toLowerCase();


      // -----------------------------------------------------
      // Global search
      // Searches ONLY by category name
      // -----------------------------------------------------

      if (
        global &&
        !categoryName.includes(global)
      ) {
        return false;
      }


      // -----------------------------------------------------
      // Name column filter
      // -----------------------------------------------------

      if (
        name &&
        !categoryName.includes(name)
      ) {
        return false;
      }


      // -----------------------------------------------------
      // Description column filter
      // -----------------------------------------------------

      if (
        description &&
        !categoryDescription.includes(description)
      ) {
        return false;
      }


      return true;

    });

  });


  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.load();
  }


  // =========================================================
  // LOAD DATA
  // =========================================================

  load(): void {

    this.loading.set(true);

    this.errorMessage.set(null);

    this.client.categoriesAll().subscribe({

      next: (data) => {

        this.categories.set(data);

        this.loading.set(false);

      },

      error: (error) => {

        console.error('Categories loading error:', error);

        this.errorMessage.set(
          'Could not load categories.'
        );

        this.notify.danger(
          'Could not load categories.'
        );

        this.loading.set(false);

      }

    });

  }


  // =========================================================
  // ADVANCE FILTER
  // =========================================================

  toggleAdvanceFilter(): void {

    this.showAdvanceFilter.update(
      value => !value
    );

  }


  // =========================================================
  // GLOBAL SEARCH
  // =========================================================

  onGlobalSearch(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    this.globalSearch.set(input.value);

  }


  clearGlobalSearch(): void {

    this.globalSearch.set('');

  }


  // =========================================================
  // NAME FILTER
  // =========================================================

  onNameFilter(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    this.nameFilter.set(input.value);

  }


  // =========================================================
  // DESCRIPTION FILTER
  // =========================================================

  onDescriptionFilter(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    this.descriptionFilter.set(input.value);

  }


  // =========================================================
  // CLEAR ALL FILTERS
  // =========================================================

  clearFilters(): void {

    this.globalSearch.set('');

    this.nameFilter.set('');

    this.descriptionFilter.set('');

  }


  // =========================================================
  // DELETE
  // =========================================================

  async remove(category: CategoryDto): Promise<void> {

    const confirmed =
      await this.alert.confirmDelete(
        category.name!
      );

    if (!confirmed) {
      return;
    }


    this.client
      .categoriesDELETE(category.id!)
      .subscribe({

        next: () => {

          this.categories.update(
            list =>
              list.filter(
                c => c.id !== category.id
              )
          );

          this.notify.danger(
            `Category "${category.name}" was deleted.`,
            'Deleted'
          );

        },

        error: () => {

          this.notify.danger(
            `Could not delete "${category.name}".`
          );

        }

      });

  }

}