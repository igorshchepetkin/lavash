// src/app/admin/admin/users/page.tsx
/*
Purpose:
Administrative user-management page for admin-panel accounts.

Responsibilities:
1. Load current admin users list.
2. Show the page in section-based admin layout:
   - header section
   - actions section
   - data section
3. Display users in a compact table with audit / password lifecycle metadata.
4. Allow ADMIN to:
   - create user
   - open/edit user card in modal
   - block / unblock user
   - reset user password
   - batch-block users
   - batch-replace roles for selected users
5. Use modal UX consistent with the rest of the admin panel.

Design intent:
Admin-panel users are durable business actors with audit history,
so the UI edits and blocks them rather than deleting them.

Outcome:
Provides structured RBAC user-directory management with individual
and bulk actions plus secure password input flows.
*/

"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminClient";

type RoleValue = "ADMIN" | "CHIEF_JUDGE" | "JUDGE";

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  roles: RoleValue[];
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  password_expires_at: string | null;
  created_at: string | null;
  created_by: string | null;
  created_by_user?: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    login?: string | null;
  } | null;
};

type PasswordDraft = {
  password: string;
  confirm: string;
  reveal: boolean;
  capsLock: boolean;
};

type EditForm = {
  id: string;
  first_name: string;
  last_name: string;
  login: string;
  roles: RoleValue[];
  is_active: boolean;
};

const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: "ADMIN", label: "Администратор" },
  { value: "CHIEF_JUDGE", label: "Главный судья" },
  { value: "JUDGE", label: "Судья" },
];

function makePasswordDraft(): PasswordDraft {
  return {
    password: "",
    confirm: "",
    reveal: false,
    capsLock: false,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU");
}

function getAuthorLabel(user: UserRow) {
  const author = user.created_by_user;
  if (!author) return "—";
  const name = [author.last_name, author.first_name].filter(Boolean).join(" ").trim();
  return name || author.login || "—";
}

function passwordMatches(draft: PasswordDraft) {
  if (draft.reveal) return true;
  return draft.password === draft.confirm;
}

function getPasswordValueForSubmit(draft: PasswordDraft) {
  return draft.password.trim();
}

function canSubmitPasswordDraft(draft: PasswordDraft) {
  const password = getPasswordValueForSubmit(draft);
  if (!password) return false;
  if (draft.reveal) return true;
  return draft.confirm.length > 0 && draft.password === draft.confirm;
}

function OpenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" />
      <path d="M9.4 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-3.1 3.8" />
      <path d="M6.5 6.5A18.2 18.2 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.1-1.2" />
    </svg>
  );
}

function PasswordEditor(props: {
  title: string;
  hint?: string;
  draft: PasswordDraft;
  setDraft: React.Dispatch<React.SetStateAction<PasswordDraft>>;
}) {
  const { title, hint, draft, setDraft } = props;

  function handleCaps(
    e: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>
  ) {
    if ("getModifierState" in e) {
      setDraft((prev) => ({
        ...prev,
        capsLock: !!e.getModifierState?.("CapsLock"),
      }));
    }
  }

  const matchKnown = !draft.reveal && (draft.password.length > 0 || draft.confirm.length > 0);
  const matchOk = passwordMatches(draft);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}

      <div
        className="mt-3"
        style={{
          display: "grid",
          gridTemplateColumns: draft.reveal
            ? "minmax(0,1fr) 44px"
            : "minmax(0,1fr) minmax(0,1fr) 44px",
          gap: "12px",
          alignItems: "end",
        }}
      >
        <label className="min-w-0 text-sm">
          <div className="mb-1 font-semibold text-slate-700">Пароль</div>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            type={draft.reveal ? "text" : "password"}
            value={draft.password}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                password: e.target.value,
              }))
            }
            onKeyDown={handleCaps}
            onKeyUp={handleCaps}
            onClick={handleCaps}
            placeholder="Введите пароль"
          />
        </label>

        {!draft.reveal && (
          <label className="min-w-0 text-sm">
            <div className="mb-1 font-semibold text-slate-700">Подтверждение пароля</div>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              type="password"
              value={draft.confirm}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  confirm: e.target.value,
                }))
              }
              onKeyDown={handleCaps}
              onKeyUp={handleCaps}
              onClick={handleCaps}
              placeholder="Повторите пароль"
            />
          </label>
        )}

        <div className="flex h-[42px] items-center justify-center">
          <a
            href="#"
            title={draft.reveal ? "Скрыть пароль" : "Показать пароль"}
            aria-label={draft.reveal ? "Скрыть пароль" : "Показать пароль"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            onClick={(e) => {
              e.preventDefault();
              setDraft((prev) => ({
                ...prev,
                reveal: !prev.reveal,
                confirm: !prev.reveal ? "" : prev.confirm,
              }));
            }}
          >
            {draft.reveal ? <EyeOffIcon /> : <EyeIcon />}
          </a>
        </div>
      </div>

      {draft.capsLock && (
        <div className="mt-3 text-xs font-semibold text-amber-700">Включён Caps Lock.</div>
      )}

      {!draft.reveal && matchKnown && (
        <div
          className={`mt-2 text-xs font-semibold ${matchOk ? "text-emerald-600" : "text-red-600"
            }`}
        >
          {matchOk ? "Пароли совпадают." : "Пароли не совпадают."}
        </div>
      )}
    </div>
  );
}

function RolesListBox(props: {
  value: RoleValue[];
  onChange: (roles: RoleValue[]) => void;
  className?: string;
  height?: number;
  disabledRoles?: RoleValue[];
}) {
  const { value, onChange, className, height = 132, disabledRoles = [] } = props;

  function toggle(role: RoleValue, checked: boolean) {
    if (disabledRoles.includes(role)) return;

    onChange(
      checked
        ? (Array.from(new Set([...value, role])) as RoleValue[])
        : value.filter((r) => r !== role)
    );
  }

  return (
    <div
      className={className}
      style={{
        height: `${height}px`,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
      }}
    >
      <div className="mb-1 text-sm font-semibold text-slate-700">Роли</div>

      <div className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
        <div className="space-y-2">
          {ROLE_OPTIONS.map((role) => {
            const disabled = disabledRoles.includes(role.value);

            return (
              <label
                key={role.value}
                className={`flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed text-slate-400" : ""
                  }`}
              >
                <input
                  type="checkbox"
                  checked={value.includes(role.value)}
                  disabled={disabled}
                  onChange={(e) => toggle(role.value, e.target.checked)}
                />
                {role.label}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    login: "",
    roles: ["JUDGE"] as RoleValue[],
  });
  const [createPasswordState, setCreatePasswordState] = useState<PasswordDraft>(
    makePasswordDraft()
  );

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editPasswordMode, setEditPasswordMode] = useState<"unlock" | "reset" | null>(null);
  const [editPasswordDraft, setEditPasswordDraft] = useState<PasswordDraft>(makePasswordDraft());

  const [showBulkRolesModal, setShowBulkRolesModal] = useState(false);
  const [bulkRoles, setBulkRoles] = useState<RoleValue[]>([]);

  const [me, setMe] = useState<any | null>(null);

  const anyModalOpen = showCreateModal || !!editUser || showBulkRolesModal;

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.includes(u.id)),
    [users, selectedIds]
  );

  const blockableSelectedUsers = selectedUsers.filter((u) => u.id !== me?.id);
  const selectedContainsSelf = selectedUsers.some((u) => u.id === me?.id);

  const isEditingSelf = !!editUser && !!me && editUser.id === me.id;

  const allVisibleSelected =
    users.length > 0 && users.every((u) => selectedIds.includes(u.id));

  const createLoginExists =
    !!createForm.login.trim() &&
    users.some(
      (u) =>
        String(u.login ?? "").trim().toLowerCase() ===
        createForm.login.trim().toLowerCase()
    );

  const createDisabled =
    busy ||
    !createForm.first_name.trim() ||
    !createForm.last_name.trim() ||
    !createForm.login.trim() ||
    createLoginExists ||
    createForm.roles.length === 0 ||
    !canSubmitPasswordDraft(createPasswordState);

  const editLoginExists =
    !!editForm?.login.trim() &&
    users.some(
      (u) =>
        u.id !== editUser?.id &&
        String(u.login ?? "").trim().toLowerCase() ===
        String(editForm?.login ?? "").trim().toLowerCase()
    );

  const editDisabled =
    busy ||
    !editForm?.first_name.trim() ||
    !editForm?.last_name.trim() ||
    !editForm?.login.trim() ||
    editLoginExists ||
    !editForm?.roles.length ||
    ((editPasswordMode === "unlock" || editPasswordMode === "reset") &&
      !canSubmitPasswordDraft(editPasswordDraft));

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function load() {
    setLoadError(null);
    try {
      const [resUsers, resMe] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/auth/me", { cache: "no-store" }),
      ]);

      const jsonUsers = await resUsers.json().catch(() => ({}));
      const jsonMe = await resMe.json().catch(() => ({}));

      if (!resUsers.ok) {
        setLoadError(jsonUsers?.error ?? "Не удалось загрузить пользователей.");
        setUsers([]);
        return;
      }

      setUsers((jsonUsers.users ?? []) as UserRow[]);
      setMe(jsonMe?.user ?? null);

      setSelectedIds((prev) =>
        prev.filter((id) => (jsonUsers.users ?? []).some((u: UserRow) => u.id === id))
      );
    } catch {
      setLoadError("Не удалось загрузить пользователей.");
      setUsers([]);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!anyModalOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        closeTopModal();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyModalOpen, busy, showCreateModal, editUser, showBulkRolesModal]);

  useEffect(() => {
    if (!anyModalOpen) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [anyModalOpen]);

  function closeTopModal() {
    if (showBulkRolesModal) {
      closeBulkRolesModal();
      return;
    }
    if (editUser) {
      closeEditModal();
      return;
    }
    if (showCreateModal) {
      closeCreateModal();
    }
  }

  function clearFeedback() {
    setActionError(null);
    setActionMessage(null);
  }

  function openCreateModal() {
    clearFeedback();
    setCreateForm({
      first_name: "",
      last_name: "",
      login: "",
      roles: ["JUDGE"],
    });
    setCreatePasswordState(makePasswordDraft());
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    if (busy) return;
    setShowCreateModal(false);
    setActionError(null);
  }

  function openEditModal(user: UserRow) {
    clearFeedback();
    setEditUser(user);
    setEditForm({
      id: user.id,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      login: user.login ?? "",
      roles: [...(user.roles ?? [])] as RoleValue[],
      is_active: !!user.is_active,
    });
    setEditPasswordMode(null);
    setEditPasswordDraft(makePasswordDraft());
  }

  function closeEditModal() {
    if (busy) return;
    setEditUser(null);
    setEditForm(null);
    setEditPasswordMode(null);
    setEditPasswordDraft(makePasswordDraft());
    setActionError(null);
  }

  function openBulkRolesModal() {
    clearFeedback();
    setBulkRoles([]);
    setShowBulkRolesModal(true);
  }

  function closeBulkRolesModal() {
    if (busy) return;
    setShowBulkRolesModal(false);
    setBulkRoles([]);
    setActionError(null);
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? users.map((u) => u.id) : []);
  }

  function toggleSelectOne(userId: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, userId])) : prev.filter((id) => id !== userId)
    );
  }

  async function createUser() {
    setBusy(true);
    setActionError(null);
    setActionMessage(null);

    const unique = await isLoginUnique(createForm.login);
    if (!unique) {
      setActionError("Пользователь с таким логином уже существует.");
      setBusy(false);
      return;
    }

    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          password: getPasswordValueForSubmit(createPasswordState),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionError(json?.error ?? "Ошибка создания пользователя.");
        return;
      }

      await load();
      setActionMessage("Пользователь создан.");
      closeCreateModal();
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(
    userId: string,
    payload: {
      first_name: string;
      last_name: string;
      login: string;
      roles: RoleValue[];
      is_active: boolean;
      unlock_password?: string | null;
    }
  ) {
    const res = await adminFetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error ?? "Не удалось сохранить пользователя.");
    }
    return json;
  }

  async function resetPassword(userId: string, password: string) {
    const res = await adminFetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error ?? "Не удалось сменить пароль.");
    }
    return json;
  }

  async function confirmAndBlock(user: UserRow) {
    const ok = window.confirm(
      `Заблокировать пользователя "${user.last_name} ${user.first_name}"?`
    );
    if (!ok) return;

    setBusy(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await patchUser(user.id, {
        first_name: user.first_name,
        last_name: user.last_name,
        login: user.login,
        roles: user.roles ?? [],
        is_active: false,
      });

      await load();
      setActionMessage("Пользователь заблокирован.");

      if (editUser?.id === user.id) {
        closeEditModal();
      }
    } catch (e: any) {
      setActionError(e?.message ?? "Не удалось заблокировать пользователя.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEditModal() {
    if (!editUser || !editForm) return;

    setBusy(true);
    setActionError(null);
    setActionMessage(null);

    const unique = await isLoginUnique(editForm.login, editUser.id);
    if (!unique) {
      setActionError("Пользователь с таким логином уже существует.");
      setBusy(false);
      return;
    }

    try {
      const payload: {
        first_name: string;
        last_name: string;
        login: string;
        roles: RoleValue[];
        is_active: boolean;
        unlock_password?: string | null;
      } = {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        login: editForm.login.trim(),
        roles: editForm.roles,
        is_active: editPasswordMode === "unlock" ? true : editForm.is_active,
      };

      if (editPasswordMode === "unlock") {
        payload.unlock_password = getPasswordValueForSubmit(editPasswordDraft);
      }

      await patchUser(editUser.id, payload);

      if (editPasswordMode === "reset") {
        await resetPassword(editUser.id, getPasswordValueForSubmit(editPasswordDraft));
      }

      await load();
      setActionMessage("Изменения сохранены.");
      closeEditModal();
    } catch (e: any) {
      setActionError(e?.message ?? "Не удалось сохранить пользователя.");
    } finally {
      setBusy(false);
    }
  }

  async function blockSelectedUsers() {
    if (blockableSelectedUsers.length === 0) return;

    const ok = window.confirm(
      `Заблокировать выбранных пользователей (${blockableSelectedUsers.length})?`
    );
    if (!ok) return;

    setBusy(true);
    setActionError(null);
    setActionMessage(null);

    try {
      for (const user of blockableSelectedUsers) {
        await patchUser(user.id, {
          first_name: user.first_name,
          last_name: user.last_name,
          login: user.login,
          roles: user.roles ?? [],
          is_active: false,
        });
      }

      await load();
      setSelectedIds([]);
      setActionMessage("Выбранные пользователи заблокированы.");
    } catch (e: any) {
      setActionError(e?.message ?? "Не удалось выполнить групповую блокировку.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkRoles() {
    if (selectedUsers.length === 0) return;
    if (bulkRoles.length === 0) {
      setActionError("Выберите хотя бы одну роль.");
      return;
    }

    setBusy(true);
    setActionError(null);
    setActionMessage(null);

    try {
      for (const user of selectedUsers) {
        await patchUser(user.id, {
          first_name: user.first_name,
          last_name: user.last_name,
          login: user.login,
          roles: bulkRoles,
          is_active: user.is_active,
        });
      }

      await load();
      setActionMessage("Роли выбранных пользователей обновлены.");
      closeBulkRolesModal();
      setSelectedIds([]);
    } catch (e: any) {
      setActionError(e?.message ?? "Не удалось изменить роли выбранных пользователей.");
    } finally {
      setBusy(false);
    }
  }

  async function isLoginUnique(login: string, excludeUserId?: string) {
    const normalized = login.trim().toLowerCase();
    if (!normalized) return false;

    return !users.some((u) => {
      const sameLogin = String(u.login ?? "").trim().toLowerCase() === normalized;
      if (!sameLogin) return false;
      if (excludeUserId && u.id === excludeUserId) return false;
      return true;
    });
  }

  const createModal =
    mounted && showCreateModal
      ? createPortal(
        <div
          onClick={closeCreateModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            background: "rgba(2, 6, 23, 0.45)",
            padding: "16px",
          }}
        >
          <div
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "24px",
              paddingBottom: "24px",
            }}
          >
            <section
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{
                maxWidth: "860px",
                maxHeight: "calc(100vh - 48px)",
                overflowY: "auto",
                overflowX: "hidden",
                boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Новый пользователь</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    Создаётся пользователь админки с временным паролем и набором ролей.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  onClick={closeCreateModal}
                >
                  Закрыть
                </button>
              </div>

              <div className="p-5">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 360px",
                    gap: "16px",
                    alignItems: "stretch",
                  }}
                >
                  <div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <label className="text-sm">
                        <div className="mb-1 font-semibold text-slate-700">Имя</div>
                        <input
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={createForm.first_name}
                          onChange={(e) =>
                            setCreateForm((prev) => ({ ...prev, first_name: e.target.value }))
                          }
                        />
                      </label>

                      <label className="text-sm">
                        <div className="mb-1 font-semibold text-slate-700">Фамилия</div>
                        <input
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={createForm.last_name}
                          onChange={(e) =>
                            setCreateForm((prev) => ({ ...prev, last_name: e.target.value }))
                          }
                        />
                      </label>
                    </div>

                    <label className="mt-3 block text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Логин</div>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2"
                        value={createForm.login}
                        onChange={(e) =>
                          setCreateForm((prev) => ({ ...prev, login: e.target.value }))
                        }
                      />
                      {createForm.login.trim() &&
                        users.some(
                          (u) =>
                            String(u.login ?? "").trim().toLowerCase() ===
                            createForm.login.trim().toLowerCase()
                        ) && (
                          <div className="mt-1 text-xs font-semibold text-red-600">
                            Такой логин уже существует.
                          </div>
                        )}
                    </label>
                  </div>

                  <RolesListBox
                    height={136}
                    value={createForm.roles}
                    onChange={(roles) => setCreateForm((prev) => ({ ...prev, roles }))}
                  />
                </div>

                <div className="mt-4">
                  <PasswordEditor
                    title="Временный пароль"
                    hint="Указанный пароль действует до первого входа. При первом входе пользователь должен будет задать новый постоянный пароль."
                    draft={createPasswordState}
                    setDraft={setCreatePasswordState}
                  />
                </div>

                {actionError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={createDisabled}
                    className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                    onClick={createUser}
                  >
                    {busy ? "Создаём..." : "Создать"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>,
        document.body
      )
      : null;

  const editModal =
    mounted && editUser && editForm
      ? createPortal(
        <div
          onClick={closeEditModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            background: "rgba(2, 6, 23, 0.45)",
            padding: "16px",
          }}
        >
          <div
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "24px",
              paddingBottom: "24px",
            }}
          >
            <section
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{
                maxWidth: "860px",
                maxHeight: "calc(100vh - 48px)",
                overflowY: "auto",
                overflowX: "hidden",
                boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Карточка пользователя</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>
                      {editUser.last_name} {editUser.first_name}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${editUser.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                        }`}
                    >
                      {editUser.is_active ? "Активен" : "Не активен"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  onClick={closeEditModal}
                >
                  Закрыть
                </button>
              </div>

              <div className="p-5">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 360px",
                    gap: "16px",
                    alignItems: "stretch",
                  }}
                >
                  <div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <label className="text-sm">
                        <div className="mb-1 font-semibold text-slate-700">Имя</div>
                        <input
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={editForm.first_name}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, first_name: e.target.value } : prev
                            )
                          }
                        />
                      </label>

                      <label className="text-sm">
                        <div className="mb-1 font-semibold text-slate-700">Фамилия</div>
                        <input
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          value={editForm.last_name}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, last_name: e.target.value } : prev
                            )
                          }
                        />
                      </label>
                    </div>

                    <label className="mt-3 block text-sm">
                      <div className="mb-1 font-semibold text-slate-700">Логин</div>
                      <input
                        className={`w-full rounded-xl border px-3 py-2 ${isEditingSelf
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                            : "border-slate-200"
                          }`}
                        value={editForm.login}
                        disabled={isEditingSelf}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, login: e.target.value } : prev
                          )
                        }
                      />
                      {!isEditingSelf &&
                        editForm.login.trim() &&
                        users.some(
                          (u) =>
                            u.id !== editUser.id &&
                            String(u.login ?? "").trim().toLowerCase() ===
                            editForm.login.trim().toLowerCase()
                        ) && (
                          <div className="mt-1 text-xs font-semibold text-red-600">
                            Такой логин уже существует.
                          </div>
                        )}
                    </label>
                  </div>

                  <RolesListBox
                    height={136}
                    value={editForm.roles}
                    disabledRoles={isEditingSelf ? ["ADMIN"] : []}
                    onChange={(roles) =>
                      setEditForm((prev) => (prev ? { ...prev, roles } : prev))
                    }
                  />
                </div>

                {(editPasswordMode === "unlock" || editPasswordMode === "reset") && (
                  <div className="mt-4">
                    <PasswordEditor
                      title={
                        editPasswordMode === "unlock"
                          ? "Новый временный пароль для разблокировки"
                          : "Новый временный пароль"
                      }
                      hint={
                        editPasswordMode === "unlock"
                          ? "Пользователь будет разблокирован после сохранения и обязан сменить пароль при следующем входе."
                          : "После сохранения пользователю будет выдан временный пароль и потребуется сменить его при следующем входе."
                      }
                      draft={editPasswordDraft}
                      setDraft={setEditPasswordDraft}
                    />
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="text-sm">
                      <div className="font-semibold text-slate-700">Дата создания</div>
                      <div className="mt-1 text-slate-600">
                        {formatDateTime(editUser.created_at)}
                      </div>
                    </div>

                    <div className="text-sm">
                      <div className="font-semibold text-slate-700">Автор</div>
                      <div className="mt-1 text-slate-600">{getAuthorLabel(editUser)}</div>
                    </div>
                  </div>
                </div>

                {actionError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={editDisabled}
                    className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                    onClick={saveEditModal}
                  >
                    {busy ? "Сохраняем..." : "Сохранить"}
                  </button>

                  {editUser.id !== me?.id ? (
                    editForm.is_active ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                        onClick={() => confirmAndBlock(editUser)}
                      >
                        Заблокировать
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
                        onClick={() => {
                          setEditPasswordMode("unlock");
                          setEditPasswordDraft(makePasswordDraft());
                        }}
                      >
                        Разблокировать
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      title='Нельзя заблокировать самого себя'
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400"
                    >
                      Заблокировать
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                    onClick={() => {
                      setEditPasswordMode("reset");
                      setEditPasswordDraft(makePasswordDraft());
                    }}
                  >
                    Сменить пароль
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>,
        document.body
      )
      : null;

  const bulkRolesModal =
    mounted && showBulkRolesModal
      ? createPortal(
        <div
          onClick={closeBulkRolesModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            background: "rgba(2, 6, 23, 0.45)",
            padding: "16px",
          }}
        >
          <div
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "24px",
              paddingBottom: "24px",
            }}
          >
            <section
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{
                maxWidth: "720px",
                maxHeight: "calc(100vh - 48px)",
                overflowY: "auto",
                overflowX: "hidden",
                boxShadow: "0 24px 64px rgba(15, 23, 42, 0.22)",
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Изменить роли</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    Новый состав ролей полностью заменит текущий у выбранных пользователей.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  onClick={closeBulkRolesModal}
                >
                  Закрыть
                </button>
              </div>

              <div className="p-5">
                <div className="mb-3 text-sm text-slate-600">
                  Выбрано пользователей:{" "}
                  <span className="font-semibold">{selectedUsers.length}</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={role.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={bulkRoles.includes(role.value)}
                        onChange={(e) =>
                          setBulkRoles((prev) =>
                            e.target.checked
                              ? (Array.from(new Set([...prev, role.value])) as RoleValue[])
                              : prev.filter((r) => r !== role.value)
                          )
                        }
                      />
                      {role.label}
                    </label>
                  ))}
                </div>

                {actionError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {actionError}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || bulkRoles.length === 0}
                    className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                    onClick={applyBulkRoles}
                  >
                    {busy ? "Сохраняем..." : "Применить"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>,
        document.body
      )
      : null;

  if (!loaded) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          Загрузка...
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Пользователи</h1>
          <p className="mt-1 text-sm text-slate-500">
            Пользователей нельзя удалять. Можно блокировать, разблокировать, менять роли и
            временные пароли.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
              onClick={openCreateModal}
            >
              Добавить
            </button>

            <button
              type="button"
              disabled={busy || blockableSelectedUsers.length === 0}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
              onClick={blockSelectedUsers}
            >
              Заблокировать
            </button>

            <button
              type="button"
              disabled={busy || selectedUsers.length === 0}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              onClick={openBulkRolesModal}
            >
              Изменить роли
            </button>

            {selectedUsers.length > 0 && (
              <div className="text-sm text-slate-500">
                Выбрано: <span className="font-semibold">{selectedUsers.length}</span>
              </div>
            )}
            {selectedContainsSelf && (
              <div className="text-sm text-amber-700">
                Собственную учётную запись нельзя заблокировать.
              </div>
            )}
          </div>

          {(actionMessage || actionError) && (
            <div className="mt-4 space-y-2">
              {actionMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {actionMessage}
                </div>
              )}
              {actionError && !anyModalOpen && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {actionError}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {loadError}
            </div>
          ) : users.length === 0 ? (
            <div className="text-sm text-slate-500">Пользователей пока нет.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] tracking-wide text-slate-500">
                    <th className="py-2 pr-4">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="py-2 pr-4">Фамилия</th>
                    <th className="py-2 pr-4">Имя</th>
                    <th className="py-2 pr-4">Логин</th>
                    <th className="py-2 pr-4">Активен</th>
                    <th className="py-2 pr-4">Роли</th>
                    <th className="py-2 pr-4">Срок действия пароля</th>
                    <th className="py-2 pr-4">Дата создания</th>
                    <th className="py-2 pr-4">Автор</th>
                    <th className="py-2 pr-0 text-right"></th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 align-top text-[12px]">
                      <td className="py-2 pr-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={(e) => toggleSelectOne(u.id, e.target.checked)}
                        />
                      </td>

                      <td className="py-2 pr-4 text-slate-900">{u.last_name}</td>
                      <td className="py-2 pr-4">{u.first_name}</td>
                      <td className="py-2 pr-4 font-semibold">{u.login}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                            }`}
                        >
                          {u.is_active ? "Да" : "Нет"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 leading-4 text-slate-700">
                        {(u.roles ?? []).length ? (
                          <div className="flex flex-col gap-0.5">
                            {(u.roles ?? []).map((role: string) => (
                              <span key={role}>
                                {ROLE_OPTIONS.find((x) => x.value === role)?.label ?? role}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(u.password_expires_at)}</td>
                      <td className="py-2 pr-4">{formatDateTime(u.created_at)}</td>
                      <td className="py-2 pr-4">{getAuthorLabel(u)}</td>
                      <td className="py-2 pr-0 text-right">
                        <a
                          href="#"
                          title="Открыть"
                          aria-label="Открыть"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          onClick={(e) => {
                            e.preventDefault();
                            openEditModal(u);
                          }}
                        >
                          <OpenIcon />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {createModal}
      {editModal}
      {bulkRolesModal}
    </>
  );
}