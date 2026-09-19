import React from "react";
import Dashboard from "./components/Dashboard.jsx";
import { RoleProvider } from "./context/RoleContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

/** Root: RBAC view + JWT demo session. */
export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <Dashboard />
      </RoleProvider>
    </AuthProvider>
  );
}
