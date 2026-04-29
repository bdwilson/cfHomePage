// Copy this file to config.js and customize it.
// config.js is gitignored — your personal values stay private.

// Your Cloudflare account ID (dash.cloudflare.com → right sidebar)
export const ACCOUNT_ID = 'YOUR_ACCOUNT_ID_HERE';

// Page title shown in the browser tab and header
export const TITLE = 'My Services';

// Apps to hide from the homepage (exact name match from Zero Trust dashboard).
// Example:
//   'App Launcher',
//   'Warp Login App',
//   'myapp /admin',
export const EXCLUDE = new Set([
]);

// Overrides for app names that don't auto-slug to a dashboardicons filename.
// Browse available icons at https://dashboardicons.com to find the right slug.
// Set value to null to skip dashboardicons and use local/avatar instead.
// Example:
//   'nodered':       'node-red',
//   'homeassistant': 'home-assistant',
//   'myapp':         null,
export const DASH_ICON_OVERRIDES = {
};

// Local icon fallbacks for apps not in dashboardicons.
// Place PNG files in public/icons/ and map them here.
// Key: substring of lowercased app name. Value: filename in public/icons/.
// Example:
//   ['myapp', 'myapp.png'],
export const LOCAL_ICONS = [
];
