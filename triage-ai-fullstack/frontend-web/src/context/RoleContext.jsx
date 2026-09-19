import React, { createContext, useContext, useState, useMemo } from "react";
import { canSee } from "../rbac/roles.js";

const RoleContext = createContext(null);

/** State phân quyền toàn dashboard: đổi role -> metrics + feed tự lọc lại. */
export function RoleProvider({ children }) {
  const [roleId, setRoleId] = useState("ceo");
  const value = useMemo(
    () => ({
      roleId,
      setRoleId,
      visible: (patients = []) => patients.filter((p) => canSee(roleId, p)),
    }),
    [roleId]
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}
