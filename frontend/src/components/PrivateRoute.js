import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Login from "./Login";

// `allowedRole` restricts a route tree to one account type
// ("retailer" | "distributor"). Without it, a logged-in retailer could open
// the entire /distributor/* UI (and vice versa) - the auth gate only ever
// checked whether *someone* was logged in (P1-7).
const PrivateRoute = ({ children, allowedRole }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen">
        {/* Page Content */}
        <main className={`flex-grow blur-background`}>
          <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm z-[9999] p-4 "
            style={{ zIndex: 9999 }}
          >
            <div
              className="bg-white p-8 rounded-lg shadow-lg w-full max-w-4xl"
              style={{
                height: "90vh", // Occupy 90% of the viewport height
                overflowY: "auto", // Allow scrolling if content overflows
              }}
            >
              <Login />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (allowedRole && user?.role && user.role !== allowedRole) {
    // Authenticated, but as the wrong account type - send them to their own
    // dashboard rather than rendering a UI meant for the other role.
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
};

export default PrivateRoute;