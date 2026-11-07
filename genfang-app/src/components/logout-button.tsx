"use client";
export function LogoutButton() {
  return (
    <button className="btn btn-quiet btn-block" onClick={async () => {
      await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
      window.location.replace("/login");
    }}>Log ud</button>
  );
}
