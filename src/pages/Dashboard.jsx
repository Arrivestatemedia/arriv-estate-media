import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";

// Dashboard has been consolidated into AdminHub. This page now redirects
// admins there so existing links/bookmarks keep working.
export default function Dashboard() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl("AdminHub"), { replace: true });
  }, [navigate]);
  return null;
}