import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { MissionsPage } from "./pages/MissionsPage.tsx";
import { SessionPage } from "./pages/SessionPage.tsx";

const router = createBrowserRouter([
	{
		path: "/",
		element: <AppLayout />,
		children: [
			{ index: true, element: <Dashboard /> },
			{ path: "sessions/:id", element: <SessionPage /> },
			{ path: "missions", element: <MissionsPage /> },
		],
	},
]);

export function App() {
	return <RouterProvider router={router} />;
}
