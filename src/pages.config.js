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
import AdminClientTerms from './pages/AdminClientTerms';
import AdminHub from './pages/AdminHub';
import AdminInvite from './pages/AdminInvite';
import AdminLogin from './pages/AdminLogin';
import AdminPaymentStatements from './pages/AdminPaymentStatements';
import AdminSalesRepActivity from './pages/AdminSalesRepActivity';
import AdminSalesSignup from './pages/AdminSalesSignup';
import AdminScheduledBookings from './pages/AdminScheduledBookings';
import AdminSignedTerms from './pages/AdminSignedTerms';
import AdminUsers from './pages/AdminUsers';
import BookingPage from './pages/BookingPage';
import ClientBookings from './pages/ClientBookings';
import ClientSignup from './pages/ClientSignup';
import ClientTermsConditions from './pages/ClientTermsConditions';
import Conference from './pages/Conference';
import ConfirmDeleteAccount from './pages/ConfirmDeleteAccount';
import ContactDetailPage from './pages/ContactDetailPage';
import ContractorDashboard from './pages/ContractorDashboard';
import ContractorSignup from './pages/ContractorSignup';
import Dashboard from './pages/Dashboard';
import DeleteAccountRequest from './pages/DeleteAccountRequest';
import ForgotEmail from './pages/ForgotEmail';
import ForgotPassword from './pages/ForgotPassword';
import JobApplication from './pages/JobApplication';
import JobBoard from './pages/JobBoard';
import ManualClosingInvoice from './pages/ManualClosingInvoice';
import MediaPartnerDashboard from './pages/MediaPartnerDashboard';
import MediaPartnerSignup from './pages/MediaPartnerSignup';
import MediaPartnerTermsConditions from './pages/MediaPartnerTermsConditions';
import MessageLogs from './pages/MessageLogs';
import NotifyBackup from './pages/NotifyBackup';
import OrientationOnboardingFee from './pages/OrientationOnboardingFee';
import OrientationSizes from './pages/OrientationSizes';
import OrientationVideo from './pages/OrientationVideo';
import PasswordSetup from './pages/PasswordSetup';
import PrivacyPolicy from './pages/PrivacyPolicy';
import PublicAccountSettings from './pages/PublicAccountSettings';
import SalesLogin from './pages/SalesLogin';
import SalesRepGmailAuthCallback from './pages/SalesRepGmailAuthCallback';
import SignIn from './pages/SignIn';
import SmsConsent from './pages/SmsConsent';
import SupraAccess from './pages/SupraAccess';
import Terms from './pages/Terms';
import TrackLink from './pages/TrackLink';
import confirmDeleteUser from './pages/confirmDeleteUser';
import HubSpotActivityLog from './pages/HubSpotActivityLog';
import AdminActivityPage from './pages/AdminActivityPage';
import SendMediaToClient from './pages/SendMediaToClient';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccountSettings": AccountSettings,
    "AdminBookings": AdminBookings,
    "AdminClientTerms": AdminClientTerms,
    "AdminHub": AdminHub,
    "AdminInvite": AdminInvite,
    "AdminLogin": AdminLogin,
    "AdminPaymentStatements": AdminPaymentStatements,
    "AdminSalesRepActivity": AdminSalesRepActivity,
    "AdminSalesSignup": AdminSalesSignup,
    "AdminScheduledBookings": AdminScheduledBookings,
    "AdminSignedTerms": AdminSignedTerms,
    "AdminUsers": AdminUsers,
    "BookingPage": BookingPage,
    "ClientBookings": ClientBookings,
    "ClientSignup": ClientSignup,
    "ClientTermsConditions": ClientTermsConditions,
    "Conference": Conference,
    "ConfirmDeleteAccount": ConfirmDeleteAccount,
    "ContactDetailPage": ContactDetailPage,
    "ContractorDashboard": ContractorDashboard,
    "ContractorSignup": ContractorSignup,
    "Dashboard": Dashboard,
    "DeleteAccountRequest": DeleteAccountRequest,
    "ForgotEmail": ForgotEmail,
    "ForgotPassword": ForgotPassword,
    "JobApplication": JobApplication,
    "JobBoard": JobBoard,
    "ManualClosingInvoice": ManualClosingInvoice,
    "MediaPartnerDashboard": MediaPartnerDashboard,
    "MediaPartnerSignup": MediaPartnerSignup,
    "MediaPartnerTermsConditions": MediaPartnerTermsConditions,
    "MessageLogs": MessageLogs,
    "NotifyBackup": NotifyBackup,
    "OrientationOnboardingFee": OrientationOnboardingFee,
    "OrientationSizes": OrientationSizes,
    "OrientationVideo": OrientationVideo,
    "PasswordSetup": PasswordSetup,
    "PrivacyPolicy": PrivacyPolicy,
    "PublicAccountSettings": PublicAccountSettings,
    "SalesLogin": SalesLogin,
    "SalesRepGmailAuthCallback": SalesRepGmailAuthCallback,
    "SignIn": SignIn,
    "SmsConsent": SmsConsent,
    "SupraAccess": SupraAccess,
    "Terms": Terms,
    "TrackLink": TrackLink,
    "confirmDeleteUser": confirmDeleteUser,
    "HubSpotActivityLog": HubSpotActivityLog,
    "AdminActivityPage": AdminActivityPage,
    "SendMediaToClient": SendMediaToClient,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};