const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, "tmp/hardware-qa");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/hardware-qa/main.tsx"></script></body></html>',
  );
  await fs.writeFile(
    path.join(directory, "main.tsx"),
    `
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {HardwareInventoryModule} from '../../src/components/inventory/HardwareInventoryModule';
    import {TooltipProvider} from '../../src/components/ui/tooltip';import {Toaster} from '../../src/components/ui/toaster';import '../../src/index.css';
    import {can} from '../../src/security/accessControl';
    const requestedRole=new URLSearchParams(location.search).get('fixtureRole');
    const role=['Management','InventoryOfficer','User'].includes(requestedRole||'')?requestedRole:'SuperAdmin';
    const user={id:role==='User'?'technician':'qa-only',role,subsidiary_id:role==='InventoryOfficer'||role==='User'?'subsidiary':null,email:'qa@example.invalid',permissions:role==='User'?['inventory.view','inventory.assign']:[]};
    function TestShell(){const [nav,setNav]=React.useState(false);const system=new URLSearchParams(location.search).has('fixtureSystemTour');return <><main className="p-4 max-w-[1600px] mx-auto">{system&&<><header data-tour="system-header" className="flex flex-wrap gap-2 p-3 border"><span>RIANA CIMS</span><button onClick={()=>{void import('../../src/components/tours/systemTour').then(({startSystemTour})=>startSystemTour(setNav))}}>System Tour</button><button data-tour="system-messages">Messages</button><button data-tour="system-theme">Theme</button><button data-tour="system-profile">Profile</button></header>{nav&&<nav className="flex flex-col gap-2 border p-3" aria-label="Fixture authorized navigation">{[['clients','Clients','clients.view'],['installations','Installations','installations.view'],['inventory','Hardware & Inventory','inventory.view'],['users','Users','users.manage'],['reports','Reports','reports.view']].filter(([, , permission])=>can(user as any,permission as any)).map(([key,label])=><button key={key} data-tour-nav={key}>{label}</button>)}</nav>}</>}<HardwareInventoryModule user={user as any}/></main><Toaster/></>}
    createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TooltipProvider><TestShell/></TooltipProvider></QueryClientProvider>);
  `,
  );
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 8091, strictPort: false,
      watch: {ignored:['**/release/**','**/CRMS/dist/**','**/Deployment/**','**/Deployment-packages/**','**/hosting/**']} },
  });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    const navigateTour = async (direction = "Next") => {
      const title = await page.locator('.driver-popover-title').innerText();
      try { await page.getByRole('button', { name: direction, exact: true }).click(); }
      catch (error) {
        console.log(JSON.stringify(await page.evaluate(() => {
          const p = document.querySelector('.driver-popover');
          const b = document.querySelector('.driver-popover-next-btn');
          const r = b?.getBoundingClientRect();
          return { title:document.querySelector('.driver-popover-title')?.textContent, active:document.querySelector('.driver-active-element')?.outerHTML.slice(0,200), popover:p && {pointer:getComputedStyle(p).pointerEvents,z:getComputedStyle(p).zIndex,rect:p.getBoundingClientRect().toJSON()}, button:r?.toJSON(),hit:r && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,150), body:getComputedStyle(document.body).pointerEvents };
        })));
        await page.screenshot({path:path.join(directory,'tour-failure.png')});
        throw error;
      }
      await page.waitForFunction((previous) => {
        const title = document.querySelector('.driver-popover-title');
        return title && title.textContent !== previous;
      }, title);
    };
    page.on("pageerror", (error) => errors.push(error.message));
    const statuses = [
      "Generated",
      "Available",
      "Reserved",
      "Assigned",
      "Installed",
      "Faulty",
      "Under Maintenance",
      "In Transit",
      "Returned",
      "Retired",
      "Disposed",
    ];
    const conditions = ["New", "Good", "Fair", "Poor", "Unserviceable"];
    const catalog = {
      statuses,
      conditions,
      variants: [
        {
          id: "MC-M",
          family: "MC",
          nickname: "Core",
          description: "Media Controller",
          retired: 0,
        },
      ],
      models: [
        {
          id: "model",
          model_number: "Core-26-M1",
          model_year: 2026,
          approval_status: "Approved",
          historical_only: 0,
          family: "MC",
          nickname: "Core",
        },
      ],
      locations: [
        {
          id: "warehouse",
          name: "Main Warehouse",
          subsidiary_id: "subsidiary",
        },
      ],
      subsidiaries: [{ id: "subsidiary", subsidiary_name: "MAREZI" }],
      clients: [{ id: "client", client_name: "Test Client" }],
      installations: [
        {
          id: "installation",
          client_id: "client",
          client_name: "Test Client",
          branch_name: "Test Branch",
          subsidiary_id: "subsidiary",
          status: "pending",
        },
      ],
      technicians: [
        {
          id: "technician",
          first_name: "Test",
          last_name: "Technician",
          subsidiary_id: "subsidiary",
        },
      ],
      policy: {
        issuance_approved: 1,
        field_approval_required: 1,
        sequence_partition: "per_model_year",
      },
    };
    const assets = statuses.map((status, i) => ({
      id: `asset-${i}`,
      serial_number: `MRZ-MC-M1-26-${1001 + i}`,
      model_id: "model",
      model_number: "Core-26-M1",
      nickname: "Core",
      family: "MC",
      subsidiary_id: "subsidiary",
      subsidiary_name: "MAREZI",
      location_id: "warehouse",
      location_name: "Main Warehouse",
      condition_grade: "Good",
      approval_status: "Approved",
      physical_verified: status === "Generated" ? 0 : 1,
      status,
      reconciliation_status: status === "Generated" ? "Unverified" : "Matched",
      registration_source: "Inventory",
      manufacturer_serial: `FACTORY-${i}`,
      manufacturing_year: 2026,
      created_at: "2026-10-12T00:00:00Z",
      updated_at: "2026-10-12T00:00:00Z",
      assignments: [],
      events: [
        {
          id: `history-${i}`,
          action: "verify",
          actor_id: "officer",
          actor_name: "Inventory Officer",
          created_at: "2026-10-12T00:00:00Z",
          details: {
            reason: "Physical kiosk inspection",
            condition_grade: "Good",
          },
        },
      ],
    }));
    assets.push({
      ...assets[4],
      id: "legacy-unidentified",
      serial_number: null,
      registration_source: "Legacy",
      condition_grade: null,
      reconciliation_status: "Unverified",
    });
    const mutations = [];
    let rejectNextAssignment = false;
    // All fixture calls are intercepted. No authentication session or database is used.
    await page.route("**/api/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if(url.pathname==='/api/time')return route.fulfill({contentType:'application/json',body:JSON.stringify({now:new Date().toISOString(),time_zone:'Africa/Nairobi'})});
      if (url.pathname.startsWith('/api/qa-error/')) {
        const status=Number(url.pathname.split('/').pop());
        if(status===0)return route.abort('connectionrefused');
        return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:status===500?'ER_BAD_FIELD_ERROR SELECT secret FROM accounts':status===409?'This serial is already assigned.':undefined})});
      }
      const endpoint = url.pathname.replace("/api/hardware", "");
      let data;
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        mutations.push({
          endpoint,
          body,
          key: req.headers()["idempotency-key"],
        });
        if (endpoint.endsWith("/assign") && rejectNextAssignment) {
          rejectNextAssignment = false;
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ error: "Equipment eligibility changed. Refresh and retry." }),
          });
          return;
        }
        if (endpoint === "/generate") {
          for (let i = 0; i < body.quantity; i++)
            assets.push({
              ...assets[0],
              id: `new-${assets.length}`,
              serial_number: `MRZ-MC-M1-26-${1001 + assets.length}`,
            });
          data = { assets: assets.slice(-body.quantity) };
        } else if (endpoint === "/reconcile")
          data = {
            id: "stocktake",
            matched: body.observed_ids,
            missing: [],
            unexpected: [],
          };
        else data = { success: true };
      } else if (endpoint === "/catalog") data = catalog;
      else if (endpoint === "/summary")
        data = {
          total: assets.length,
          pending: 0,
          counts: Object.fromEntries(
            statuses.map((s) => [
              s,
              assets.filter((a) => a.status === s).length,
            ]),
          ),
        };
      else if (endpoint === "/alerts")
        data = { rules: [], low_stock: [], assets: [] };
      else if (
        endpoint === "/assets" ||
        endpoint === "/export" ||
        endpoint === "/reports"
      ) {
        let filtered = assets;
        if (url.searchParams.get("status"))
          filtered = filtered.filter(
            (a) => a.status === url.searchParams.get("status"),
          );
        if(url.searchParams.get('report')==='in_stock')filtered=filtered.filter((a)=>['Available','Reserved','Returned'].includes(a.status));
        if(url.searchParams.get('report')==='out')filtered=filtered.filter((a)=>['Assigned','Installed','In Transit'].includes(a.status));
        if (url.searchParams.get("q"))
          filtered = filtered.filter(
            (a) =>
              a.serial_number?.includes(url.searchParams.get("q")) ||
              a.id === url.searchParams.get("q"),
          );
        const limit = Number(url.searchParams.get("limit") || 30),
          p = Number(url.searchParams.get("page") || 1);
        data = {
          rows: filtered.slice((p - 1) * limit, p * limit),
          total: filtered.length,
        };
      } else if (endpoint.startsWith("/assets/"))
        data = assets.find((a) => a.id === endpoint.split("/")[2]);
      else if (endpoint === "/models/model")
        data = {
          model: {
            model_number: "Core-26-M1",
            specifications: { summary: "Media controller" },
          },
          events: [
            {
              id: "proposal",
              action: "model_propose",
              created_at: "2026-10-12T00:00:00Z",
              details: { model_number: "Core-26-M1" },
            },
            {
              id: "decision",
              action: "model_approve",
              created_at: "2026-10-12T01:00:00Z",
              details: {
                approval_status: "Approved",
                reason: "Approved controller",
              },
            },
          ],
        };
      else if (endpoint === "/movements")
        data = {
          rows: [
            {
              id: "movement",
              serial_number: assets[1].serial_number,
              action: "verify",
              actor_id: "officer",
              actor_name: "Inventory Officer",
              created_at: "2026-10-12T00:00:00Z",
              details: { reason: "Physical kiosk inspection" },
            },
          ],
          total: 1,
        };
      else if (url.pathname === "/api/files") data = { data: [] };
      else data = {};
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const results = [];
    if (!process.env.HARDWARE_QA_REPORTS_ONLY) {
    for (const [name, width, height, dark] of [
      ["desktop", 1440, 1000, false],
      ["desktop-dark", 1440, 1000, true],
      ["tablet", 768, 1024, false],
      ["tablet-dark", 768, 1024, true],
      ["mobile", 390, 844, false],
      ["mobile-small", 320, 740, false],
      ["mobile-dark", 390, 844, true],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/tmp/hardware-qa/index.html`);
      await page.locator("h1").waitFor();
      if (name === 'desktop') {
        await page.getByRole('table').getByText(assets[0].serial_number,{exact:true}).waitFor();
        const original = { ...assets[0] };
        assets[0].status = 'Installed';
        assets[0].client_name = 'Polling QA Client';
        assets[0].branch_name = 'Polling QA Branch';
        await page.getByRole('table').getByRole('cell', {name:/Polling QA Client/}).waitFor({timeout:22000});
        await page.screenshot({path:path.join(directory,'automatic-assignment-refresh.png')});
        Object.assign(assets[0],original);
        delete assets[0].client_name;
        delete assets[0].branch_name;
        await page.reload();
        await page.locator('h1').waitFor();
      }
      await page
        .getByRole("button", { name: "Generate Serials", exact: true })
        .waitFor();
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        dark,
      );
      await page
        .getByRole("button", { name: assets[0].serial_number, exact: true })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Serial Pending Reconciliation",
          exact: true,
        })
        .waitFor();
      if (width >= 640)
        await page.getByText("Not Assessed", { exact: true }).waitFor();
      const beforeTour = mutations.length;
      await page
        .getByRole("button", { name: "Module Tour", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Hardware & Inventory Tour",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .locator('.driver-active-element[data-tour="inventory-header"]')
          .count(),
        1,
      );
      await page.screenshot({
        path: path.join(directory, `${name}-tour.png`),
        animations: "disabled",
      });
      const bounds = await page.getByRole("dialog").boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y + bounds.height <= height,
      );
      await navigateTour();
      await page
        .getByRole("heading", {
          name: "Understand the Stock Overview",
          exact: true,
        })
        .waitFor();
      await navigateTour("Back");
      for (
        let step = 0;
        step < 32 &&
        (await page
          .getByRole("button", { name: "Next", exact: true })
          .isVisible());
        step++
      ) {
        await page.locator(".driver-active-element").waitFor();
        await navigateTour();
      }
      await page
        .getByRole("button", { name: "Finish Tour", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        mutations.length,
        beforeTour,
        "Tour never mutates inventory",
      );
      assert.equal(
        await page
          .getByRole("tab", { name: "Registry", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("tab", { name: "Models", exact: true }).click();
      await page.waitForFunction(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent==='Models');
      await page
        .getByRole("button", { name: "Module Tour", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Hardware & Inventory Tour",
          exact: true,
        })
        .waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForFunction(()=>document.querySelector('[role="tab"][aria-selected="true"]')?.textContent==='Models');
      assert.equal(
        await page
          .getByRole("tab", { name: "Models", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("tab", { name: "Registry", exact: true }).click();
      assert.equal(
        await page.getByLabel("Client Filter", { exact: true }).count(),
        0,
      );
      await page.getByRole("button", { name: /Advanced Filters/ }).click();
      await page
        .getByLabel("Client Filter", { exact: true })
        .selectOption("client");
      await page.getByRole("button", { name: /Advanced Filters/ }).click();
      await page.getByRole("button", { name: /Advanced Filters/ }).click();
      assert.equal(
        await page.getByLabel("Client Filter", { exact: true }).inputValue(),
        "client",
      );
      await page
        .getByRole("button", { name: "Clear all filters", exact: true })
        .click();
      await page.getByRole("button", { name: /Advanced Filters/ }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        `${name} must not overflow the viewport`,
      );
      await page.screenshot({
        path: path.join(directory, `${name}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Generate Serials", exact: true })
        .click();
      await page
        .getByLabel("Approved Model", { exact: true })
        .selectOption("model");
      await page.getByLabel("Quantity", { exact: true }).fill("2");
      assert.equal(
        await page
          .getByLabel("Serial Year", { exact: true })
          .getAttribute("readonly"),
        "",
      );
      await page.screenshot({
        path: path.join(directory, `${name}-generation.png`),
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok(mutations.at(-1).key);
      assert.equal(mutations.at(-1).body.quantity, 2);
      assert.ok(
        assets
          .slice(-2)
          .every((a) => a.status === "Generated" && !a.physical_verified),
      );
      await page.getByRole("button", { name: /^Available/ }).click();
      await page
        .getByRole("button", { name: assets[1].serial_number, exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: assets[1].serial_number, exact: true })
        .click();
      await page.getByRole("heading", { name: "Assignment History" }).waitFor();
      await page.screenshot({
        path: path.join(directory, `${name}-profile.png`),
        animations: "disabled",
      });
      const profileBounds = await page.getByRole("dialog").boundingBox();
      assert.ok(
        profileBounds.x >= 0 &&
          profileBounds.y >= 0 &&
          profileBounds.x + profileBounds.width <= width &&
          profileBounds.y + profileBounds.height <= height,
        `${name} profile fits viewport`,
      );
      await page.getByRole("button", { name: "Assign", exact: true }).click();
      await page.getByLabel("Client", { exact: true }).selectOption("client");
      await page
        .getByLabel("Client / Branch Installation", { exact: true })
        .selectOption("installation");
      await page
        .getByLabel("Receiving Technician", { exact: true })
        .selectOption("technician");
      await page.screenshot({
        path: path.join(directory, `${name}-allocation.png`),
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await page
        .getByLabel("Client / Branch Installation", { exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(mutations.at(-1).body.client_id, "client");
      assert.equal(mutations.at(-1).body.installation_id, "installation");
      await page.getByRole("button", { name: "QR Label", exact: true }).click();
      await page.getByRole("heading", { name: "MAREZI QR Labels" }).waitFor();
      assert.equal(await page.getByText('Registered in Riana CIMS',{exact:true}).count(),0);
      await page.getByAltText(`QR for ${assets[1].serial_number}`).waitFor();
      const img = page.getByAltText(`QR for ${assets[1].serial_number}`);
      assert.equal(
        await img.evaluate((e) => e.complete && e.naturalWidth > 0),
        true,
      );
      await page.screenshot({
        path: path.join(directory, `${name}-labels.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("heading", { name: "MAREZI QR Labels" })
        .waitFor({ state: "hidden" });
      await page.keyboard.press("Escape");
      await page
        .getByRole("heading", { name: "Assignment History" })
        .waitFor({ state: "hidden" });
      await page.getByRole("tab", { name: "Models", exact: true }).click();
      await page
        .getByRole("button", { name: "Core-26-M1", exact: true })
        .click();
      await page.getByText("Model submitted", { exact: true }).waitFor();
      assert.equal(await page.getByRole("dialog").locator("pre").count(), 0);
      await page.getByText("Approved controller", { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(directory, `${name}-model-history.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .getByText("Model submitted", { exact: true })
        .waitFor({ state: "hidden" });
      await page.getByRole("tab", { name: "Reports", exact: true }).click();
      await page
        .getByLabel("Hardware Report", { exact: true })
        .selectOption("Available");
      await page
        .getByRole("button", { name: assets[1].serial_number, exact: true })
        .waitFor();
      await page
        .getByLabel("Hardware Report", { exact: true })
        .selectOption("Generated");
      await page
        .getByRole("button", { name: assets[0].serial_number, exact: true })
        .waitFor();
      await page
        .getByLabel("Hardware Report", { exact: true })
        .selectOption("movement");
      await page.getByText("Inventory Officer", { exact: true }).waitFor();
      const downloadPending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await page
        .getByRole("menuitem", { name: "Export CSV", exact: true })
        .click();
      const download = await downloadPending;
      const csvPath = path.join(directory, `${name}-history.csv`);
      await download.saveAs(csvPath);
      const csv = await fs.readFile(csvPath, "utf8");
      assert.ok(
        csv.includes("Performed By") &&
          csv.includes("Inventory Officer") &&
          csv.includes("Date / Time (EAT)"),
      );
      assert.ok(!csv.includes('{"'));
      await page.goto(
        `${base}/tmp/hardware-qa/index.html?hardware=${encodeURIComponent(assets[1].id)}`,
      );
      await page
        .getByRole("heading", { name: "Lifecycle Timeline", exact: true })
        .waitFor();
      await page
        .getByText("Physical stock verified", { exact: true })
        .waitFor();
      await page
        .getByText("Physical kiosk inspection", { exact: true })
        .waitFor();
      assert.equal(await page.getByRole("dialog").locator("pre").count(), 0);
      await page.screenshot({
        path: path.join(directory, `${name}-qr-history.png`),
        animations: "disabled",
      });
      results.push({
        viewport: name,
        generation: true,
        profile: true,
        qr: true,
        allocation: true,
        modelHistory: true,
        reports: true,
        qrHistory: true,
        serialClarity: true,
        advancedFilters: true,
        operatorReporting: true,
        historyCsv: true,
        guidedTour: true,
        noOverflow: true,
      });
    }
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/tmp/hardware-qa/index.html?fixtureRole=User`);
      await page.getByRole("button", { name: assets[1].serial_number, exact: true }).click();
      await page.getByRole("button", { name: "Assign", exact: true }).click();
      await page.getByLabel("Client", { exact: true }).selectOption("client");
      await page.getByLabel("Client / Branch Installation", { exact: true }).selectOption("installation");
      await page.getByLabel("Receiving Technician", { exact: true }).selectOption("technician");
      const beforeConfirmation = mutations.length;
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      const error = page.getByRole("dialog").last().getByRole("alert");
      await error.getByText("Confirm the physical serial and device identity before selection.").waitFor();
      assert.equal(mutations.length, beforeConfirmation);
      await page.getByRole("checkbox", { name: "Physical identity and serial confirmed" }).check();
      rejectNextAssignment = true;
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await error.getByText("Equipment eligibility changed. Refresh and retry.").waitFor();
      await page.screenshot({ path: path.join(directory, `technician-${width}-assignment-error.png`), animations: "disabled" });
      assert.equal(mutations.at(-1).body.physical_confirmed, true);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await page.getByLabel("Client / Branch Installation", { exact: true }).waitFor({ state: "hidden" });
      assert.equal(mutations.at(-1).body.physical_confirmed, true);
      results.push({ viewport: `technician-${width}`, physicalConfirmation: true, persistentApiError: true, successfulRetry: true });
    }
    for (const role of ["Management", "InventoryOfficer"]) {
      await page.goto(`${base}/tmp/hardware-qa/index.html?fixtureRole=${role}`);
      await page
        .getByRole("button", { name: "Module Tour", exact: true })
        .click();
      const beforeTour = mutations.length;
      const titles = [];
      for (let step = 0; step < 32; step++) {
        titles.push(
          await page.getByRole("dialog").getByRole("heading").innerText(),
        );
        if (
          !(await page
            .getByRole("button", { name: "Next", exact: true })
            .isVisible())
        )
          break;
        await navigateTour();
      }
      assert.ok(!titles.includes("Approve the Serialization Policy"));
      if (role === "Management")
        assert.ok(
          !titles.includes("Generate Serials") &&
            !titles.includes("Allocate Equipment"),
        );
      else
        assert.ok(
          titles.includes("Generate Serials") &&
            titles.includes("Allocate Equipment"),
        );
      await page
        .getByRole("button", { name: "Finish Tour", exact: true })
        .click();
      assert.equal(mutations.length, beforeTour);
    }
    for (const role of ["SuperAdmin", "InventoryOfficer"])
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(
          `${base}/tmp/hardware-qa/index.html?fixtureRole=${role}&fixtureSystemTour=1`,
        );
        const beforeTour = mutations.length;
        await page
          .getByRole("button", { name: "System Tour", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "RIANA CIMS System Tour", exact: true })
          .waitFor();
        const titles = [];
        for (let step = 0; step < 32; step++) {
          const title = await page
            .getByRole("dialog")
            .getByRole("heading")
            .innerText();
          titles.push(title);
          await page.locator(".driver-active-element").waitFor();
          if (title === "Hardware & Inventory") {
            assert.equal(
              await page
                .locator(".driver-active-element")
                .getAttribute("data-tour-nav"),
              "inventory",
            );
            await page.screenshot({
              path: path.join(directory, `${role}-${width}-system-tour.png`),
              animations: "disabled",
            });
          }
          if (
            !(await page
              .getByRole("button", { name: "Next", exact: true })
              .isVisible())
          )
            break;
          await navigateTour();
        }
        assert.ok(
          titles.includes("Hardware & Inventory") &&
            titles.includes("Your Profile"),
        );
        if (role === "InventoryOfficer")
          assert.ok(
            !titles.includes("Users") &&
              !titles.includes("Clients") &&
              !titles.includes("Installations"),
          );
        else assert.ok(titles.includes("Users") && titles.includes("Clients"));
        await page
          .getByRole("button", { name: "Finish Tour", exact: true })
          .click();
        assert.equal(mutations.length, beforeTour);
        await page
          .getByRole("navigation", { name: "Fixture authorized navigation" })
          .waitFor({ state: "hidden" });
      }
    }
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});
      await page.goto(`${base}/tmp/hardware-qa/index.html?fixtureRole=InventoryOfficer`);
      await page.getByRole('tab',{name:'Reports',exact:true}).click();
      const totals=page.getByRole('region',{name:'Inventory report totals'});
      await totals.getByRole('button',{name:/Out \/ issued/}).click();
      await page.getByLabel('Hardware Report',{exact:true}).selectOption('out');
      await page.getByRole('button',{name:assets[3].serial_number,exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:assets[1].serial_number,exact:true}).count(),0);
      await totals.getByRole('button',{name:/In stock/}).click();
      await page.getByRole('button',{name:assets[1].serial_number,exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:assets[3].serial_number,exact:true}).count(),0);
      assert.equal(await page.getByLabel('Hardware Report',{exact:true}).inputValue(),'in_stock');
      await totals.getByRole('button',{name:/Faulty/}).click();
      await page.getByRole('button',{name:assets[5].serial_number,exact:true}).waitFor();
      assert.equal(await page.getByLabel('Status Filter',{exact:true}).inputValue(),'Faulty');
      const downloadPromise=page.waitForEvent('download');
      await totals.getByRole('button',{name:'Export Summary',exact:true}).click();
      const download=await downloadPromise;
      const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk;
      assert.ok(csv.includes(`Out / issued,${assets.filter((a)=>['Assigned','Installed','In Transit'].includes(a.status)).length}`));
      assert.ok(csv.includes(`In stock,${assets.filter((a)=>['Available','Reserved','Returned'].includes(a.status)).length}`));
      assert.match(csv,/Faulty,1/);assert.match(csv,/Returned,1/);
      const box=await totals.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width);
      assert.equal(await page.locator('vite-error-overlay').count(),0);
      await page.screenshot({path:path.join(directory,`officer-${width}-report-totals.png`)});
    }
    const errorChecks=await page.evaluate(async()=>{
      const {apiFetch,fetchAuthenticatedBlob}=await import('/src/integrations/apiClient.ts');
      const {apiRequest}=await import('/CRMS/src/lib/apiRequest.ts');
      const results=[];
      for(const status of [403,404,409,429,500]){
        try{await apiFetch(`/qa-error/${status}`,{},0);}catch(e){results.push({status,message:e.message});}
      }
      for(const [name,run] of [['network',()=>apiFetch('/qa-error/0',{method:'POST'},0)],['file',()=>fetchAuthenticatedBlob('/qa-error/500')],['developers',()=>apiRequest('/api/qa-error/500')]]){
        try{await run();}catch(e){results.push({name,message:e.message});}
      }
      return results;
    });
    assert.equal(errorChecks.length,8);
    assert.ok(errorChecks.every((r)=>!r.message.includes('ER_BAD_FIELD_ERROR')));
    assert.match(errorChecks.find((r)=>r.status===409).message,/already assigned/);
    assert.match(errorChecks.find((r)=>r.name==='network').message,/check whether it was saved/);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(directory, "results.json"),
      JSON.stringify({ fixtureOnly: true, results, errors }, null, 2),
    );
    console.log(
      JSON.stringify(
        { fixtureOnly: true, results, officerReportTotals:true, summaryCsv:true, friendlyErrors:errorChecks, errors, screenshots: directory },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
