/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccountSettings from './pages/AccountSettings';
import AdminBookings from './pages/AdminBookings';
import AdminInvite from './pages/AdminInvite';
import AdminUsers from './pages/AdminUsers';
import BookingPage from './pages/BookingPage';
import ConfirmDeleteAccount from './pages/ConfirmDeleteAccount';
import ContractorDashboard from './pages/ContractorDashboard';
import ContractorSignup from './pages/ContractorSignup';
import Dashboard from './pages/Dashboard';
import DeleteAccountRequest from './pages/DeleteAccountRequest';
import JobBoard from './pages/JobBoard';
import NotifyBackup from './pages/NotifyBackup';
import PasswordSetup from './pages/PasswordSetup';
import PublicAccountSettings from './pages/PublicAccountSettings';
import SignIn from './pages/SignIn';
import confirmDeleteUser from './pages/confirmDeleteUser';
import ClientSignup from './pages/ClientSignup';
import ClientBookings from './pages/ClientBookings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountSettings": AccountSettings,
    "AdminBookings": AdminBookings,
    "AdminInvite": AdminInvite,
    "AdminUsers": AdminUsers,
    "BookingPage": BookingPage,
    "ConfirmDeleteAccount": ConfirmDeleteAccount,
    "ContractorDashboard": ContractorDashboard,
    "ContractorSignup": ContractorSignup,
    "Dashboard": Dashboard,
    "DeleteAccountRequest": DeleteAccountRequest,
    "JobBoard": JobBoard,
    "NotifyBackup": NotifyBackup,
    "PasswordSetup": PasswordSetup,
    "PublicAccountSettings": PublicAccountSettings,
    "SignIn": SignIn,
    "confirmDeleteUser": confirmDeleteUser,
    "ClientSignup": ClientSignup,
    "ClientBookings": ClientBookings,
}

export const pagesConfig = {
    mainPage: "AccountSettings",
    Pages: PAGES,
    Layout: __Layout,
};