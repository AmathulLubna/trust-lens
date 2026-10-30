import { Navigate } from "react-router";

// Keep existing companion links working while using the regular dashboard.
export default function Voice() {
  return <Navigate to="/dashboard?tab=guard" replace />;
}
