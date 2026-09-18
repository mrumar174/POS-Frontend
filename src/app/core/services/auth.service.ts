import { Injectable, computed, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Client, LoginDto, TenantSignupDto, AuthResponseDto, UserDto } from '../api/api-client';

const STORAGE_KEY = 'pos_session';

interface StoredSession {
  token: string;
  expiresAtUtc: string;
  tenantId: number;
  shopId: number;
  user: UserDto;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionSignal = signal<StoredSession | null>(this.readStoredSession());

  readonly currentUser = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);
  readonly tenantId = computed(() => this.sessionSignal()?.tenantId ?? null);
  readonly shopId = computed(() => this.sessionSignal()?.shopId ?? null);
  readonly roles = computed(() => this.sessionSignal()?.user.roles ?? []);

  constructor(private client: Client) {}

  get token(): string | null {
    return this.sessionSignal()?.token ?? null;
  }

  login(dto: LoginDto): Observable<AuthResponseDto> {
    return this.client.login(dto).pipe(tap((response) => this.storeSession(response)));
  }

  signup(dto: TenantSignupDto): Observable<AuthResponseDto> {
    return this.client.signup(dto).pipe(tap((response) => this.storeSession(response)));
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionSignal.set(null);
  }

  private storeSession(response: AuthResponseDto): void {
    const session: StoredSession = {
      token: response.token!,
      expiresAtUtc: response.expiresAtUtc!.toISOString(), // NSwag gives a real Date object
      tenantId: response.tenantId!,
      shopId: response.shopId!,
      user: response.user!
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.sessionSignal.set(session);
  }

  private readStoredSession(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const session: StoredSession = JSON.parse(raw);
      if (new Date(session.expiresAtUtc).getTime() <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }
}