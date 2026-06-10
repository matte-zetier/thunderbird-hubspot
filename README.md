# HubSpot Extension for Thunderbird

I really detest webmail, but I make pretty heavy use of HubSpot. This extension lets me use HubSpot from within Thunderbird. It aims to replicate the basics of the [HubSpot Sales extension for Chrome](https://chromewebstore.google.com/detail/hubspot-sales/oiiaigjnkhngdbnoookogelabohpglmd), letting you select who's associated with emails you're sending and receiving.

**AI Notice**: I whipped this up exclusively vibecoding with Claude. I make no promises and I feel no shame. I am unrepentant.

### What it does:
* Set contacts, companies, and deals associated with both received and draft emails
* Saves that we've associated an email with HubSpot so it can show you what it's been associated with again.

### What it doesn't do:
* Show a sidebar with details about contacts associated with the email (todo)
* Let you set a tracking pixel (HubSpot doesn't provide this via API, so this is a `never-do`)

## Getting Started
### Building & Installing the Extension
1. Clone the repo
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. You'll get a zip file in `web-ext-artifacts/`, rename the extension to `xpi`.
5. In Thunderbird from the add-ons manager, select the gear and then select "Install Add-on From File...", and select your file you just renamed.

### Configuring HubSpot
HubSpot changes things around. This is up-to-date as of the commit of this README.

You're going to want to create a "Service Key":
1. From your preferences, select Integrations -> Service Keys
2. Select "Create service key"
3. Give it a useful name and select the following scopes:
   * `crm.objects.contacts.read`
   * `crm.objects.contacts.write`
   * `crm.objects.companies.read`
   * `crm.objects.companies.write`
   * `crm.objects.deals.read`
   * `crm.objects.deals.write`
4. On creation, it'll give you a secret. Give this to the extension when it asks for a key to login.

(C) 2026, Zetier, Inc.
