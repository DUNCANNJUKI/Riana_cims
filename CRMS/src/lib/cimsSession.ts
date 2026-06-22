export interface CimsSessionUser {
  id: string;
  email?: string;
  role?: "SuperAdmin" | "Admin" | "Teamlead" | "Developer" | "Sales" | "User";
  module_roles?: Partial<Record<"cims" | "crms", "SuperAdmin" | "Admin" | "Teamlead" | "Developer" | "Sales" | "User" | null>>;
  first_name?: string;
  last_name?: string;
}

export const getCimsToken = () => localStorage.getItem("riana-auth-token");

export const getCimsUser = (): CimsSessionUser | null => {
  const rawUser = localStorage.getItem("riana_user");
  if (!rawUser) return null;

  try {
    const user = JSON.parse(rawUser) as CimsSessionUser;
    return user?.id ? user : null;
  } catch {
    return null;
  }
};

export const clearCimsSession = () => {
  localStorage.removeItem("riana-auth-token");
  localStorage.removeItem("riana_user");
};
