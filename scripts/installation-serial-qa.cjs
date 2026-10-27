const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const fixture = path.join(root, "tmp/installation-serial-qa");
  const evidence = await fs.mkdtemp(
    path.join(os.tmpdir(), "cims-installation-serial-qa-"),
  );
  await fs.mkdir(fixture, { recursive: true });
  await fs.writeFile(
    path.join(fixture, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/installation-serial-qa/main.tsx"></script></body></html>',
  );
  await fs.writeFile(
    path.join(fixture, "main.tsx"),
    `
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {InstallationSerialPicker} from '../../src/components/inventory/InstallationSerialPicker';import {HardwareInventoryModule} from '../../src/components/inventory/HardwareInventoryModule';
    import {TooltipProvider} from '../../src/components/ui/tooltip';import {Toaster} from '../../src/components/ui/toaster';import {apiClient} from '../../src/integrations/apiClient';import '../../src/index.css';
    const inventory=new URLSearchParams(location.search).has('inventory');
    const user={id:'technician',role:inventory?'InventoryOfficer':'User',subsidiary_id:'subsidiary',permissions:['inventory.view','inventory.assign','inventory.install','inventory.register']};
    function Fixture(){const [selection,setSelection]=React.useState();const [result,setResult]=React.useState('');return <main className="p-4 max-w-4xl mx-auto">{inventory?<HardwareInventoryModule user={user as any}/>:<><h1>Installation Equipment</h1><InstallationSerialPicker user={user as any} installation={{id:'installation',client_id:'client',status:'in_progress',media_controllers:2,ups_count:1} as any} subsidiaryId="subsidiary" value={selection as any} onChange={setSelection as any}/><button onClick={()=>apiClient.patch('/installations/installation',{media_controllers:2,ups_count:1,hardware_selection:selection}).then(()=>setResult('Saved')).catch((e)=>setResult(e.message))}>Save Installation</button><p role="status">{result}</p></>}</main>}
    createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><Fixture/><Toaster/></TooltipProvider></QueryClientProvider>);
  `,
  );
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const models = [
      {
        id: "mc-model",
        model_number: "Core-26-M1",
        family: "MC",
        model_year: 2026,
        approval_status: "Approved",
        equipment_field: "media_controllers",
        historical_only: 0,
      },
      {
        id: "ups-model",
        model_number: "Vault-26-R1",
        family: "SSK",
        model_year: 2026,
        approval_status: "Approved",
        equipment_field: "ups_count",
        historical_only: 0,
      },
    ];
    const assets = [
      {
        id: "mc1",
        model_id: "mc-model",
        model_number: "Core-26-M1",
        serial_number: "MRZ-MC-M1-26-1001",
        equipment_field: "media_controllers",
        status: "Available",
      },
      {
        id: "generated",
        model_id: "mc-model",
        model_number: "Core-26-M1",
        serial_number: "MRZ-MC-M1-26-1010",
        equipment_field: "media_controllers",
        status: "Generated",
        selectable: false,
        unavailable_reason:
          "Registered serial; Receive & Verify is required before allocation.",
      },
      {
        id: "mc2",
        model_id: "mc-model",
        model_number: "Core-26-M1",
        serial_number: "MRZ-MC-M1-26-1002",
        equipment_field: "media_controllers",
        status: "Available",
      },
      {
        id: "mc3",
        model_id: "mc-model",
        model_number: "Core-26-M1",
        serial_number: "MRZ-MC-M1-26-1003",
        equipment_field: "media_controllers",
        status: "Available",
      },
      {
        id: "ups1",
        model_id: "ups-model",
        model_number: "Vault-26-R1",
        serial_number: "MRZ-SSK-R1-26-1001",
        equipment_field: "ups_count",
        status: "Available",
      },
    ].map((a) => ({
      ...a,
      subsidiary_id: "subsidiary",
      location_name: "Warehouse",
      physical_verified: 1,
      approval_status: "Approved",
      reconciliation_status: "Matched",
      condition_grade: "Good",
    }));
    let upsRequired = false;
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if(url.pathname==='/api/time')return route.fulfill({contentType:'application/json',body:JSON.stringify({now:new Date().toISOString(),time_zone:'Africa/Nairobi'})});
      let data = {};
      if (["POST", "PATCH"].includes(request.method())) {
        const body = request.postDataJSON();
        requests.push({ path: url.pathname, body });
        if (url.pathname.endsWith("/equipment_requirement"))
          upsRequired = body.serial_required;
        data = { success: true };
      } else if (url.pathname.endsWith("/equipment-requirements"))
        data = {
          subsidiaries: [
            {
              id: "subsidiary",
              subsidiary_name: "MAREZI",
              can_edit: true,
              equipment: [
                {
                  field: "kiosk_count",
                  label: "Kiosks",
                  serial_required: true,
                  model_numbers: ["Wave-26-C1"],
                },
                {
                  field: "media_controllers",
                  label: "Media Controllers",
                  serial_required: false,
                  model_numbers: ["Core-26-M1"],
                },
                {
                  field: "ups_count",
                  label: "UPS Units",
                  serial_required: upsRequired,
                  model_numbers: [],
                },
              ],
            },
            {
              id: "other",
              subsidiary_name: "OTHER",
              can_edit: false,
              equipment: [
                {
                  field: "kiosk_count",
                  label: "Kiosks",
                  serial_required: true,
                  model_numbers: [],
                },
                {
                  field: "ups_count",
                  label: "UPS Units",
                  serial_required: false,
                  model_numbers: [],
                },
              ],
            },
          ],
        };
      else if (url.pathname.endsWith("/catalog"))
        data = {
          models,
          variants: [],
          locations: [],
          subsidiaries: [{ id: "subsidiary", subsidiary_name: "MAREZI" }],
          policy: { issuance_approved: 1 },
          statuses: ["Available"],
          conditions: ["Good"],
          equipment_fields: [
            { field: "media_controllers", label: "Media Controllers" },
            { field: "ups_count", label: "UPS Units" },
          ],
        };
      else if (url.pathname.endsWith("/assets")) {
        const q = url.searchParams.get("q") || "";
        data = {
          rows: assets.filter((a) => a.serial_number.includes(q)),
          total: assets.length,
        };
      } else if (url.pathname.endsWith("/summary"))
        data = {
          total: assets.length,
          counts: { Available: assets.length },
          pending: 0,
        };
      else if (url.pathname.endsWith("/alerts"))
        data = { rules: [], low_stock: [], assets: [] };
      else if (url.pathname.endsWith("/installations/installation"))
        data = { rows: [] };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const results = [];
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/tmp/installation-serial-qa/index.html`);
      await page.getByRole("button", { name: /Media Controllers/ }).click();
      await page.getByLabel("Search Serial / Manufacturer Serial").fill("1010");
      await page
        .getByText(
          "Registered serial; Receive & Verify is required before allocation.",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Select MRZ-MC-M1-26-1010",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      await page.getByLabel("Search Serial / Manufacturer Serial").fill("");
      await page
        .getByRole("button", { name: "Select MRZ-MC-M1-26-1001", exact: true })
        .click();
      await page.getByLabel("Search Serial / Manufacturer Serial").fill("1002");
      await page
        .getByRole("button", { name: "Select MRZ-MC-M1-26-1002", exact: true })
        .click();
      await page.getByLabel("Search Serial / Manufacturer Serial").fill("");
      await page
        .getByRole("button", { name: "Select MRZ-MC-M1-26-1003", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Select MRZ-MC-M1-26-1003",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: /UPS Units/ }).click();
      await page
        .getByRole("button", { name: "Select MRZ-SSK-R1-26-1001", exact: true })
        .click();
      await page
        .getByRole("checkbox", {
          name: "Physical devices match the selected serials",
        })
        .check();
      await page
        .getByRole("checkbox", {
          name: "Selected equipment is physically installed",
        })
        .check();
      await page
        .getByRole("button", { name: "Save Installation", exact: true })
        .click();
      await page.getByText("Saved", { exact: true }).waitFor();
      assert.equal(requests.at(-1).body.hardware_selection.assets.length, 3);
      assert.equal(
        requests.at(-1).body.hardware_selection.mark_installed,
        true,
      );
      assert.equal(await page.locator("vite-error-overlay").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(evidence, `serial-selection-${width}.png`),
        fullPage: true,
      });
      results.push({
        width,
        serialSearch: true,
        dynamicUpsMapping: true,
        quantityLimit: true,
        savePayload: true,
      });
    }
    await page.goto(
      `${base}/tmp/installation-serial-qa/index.html?inventory=1`,
    );
    await page
      .getByRole("tab", { name: "Equipment Requirements", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Serial required for Kiosks in MAREZI",
          exact: true,
        })
        .isDisabled(),
      false,
    );
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Serial required for UPS Units in OTHER",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    const requirementSave = page.waitForResponse(
      (r) =>
        r.url().endsWith("/equipment_requirement") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("checkbox", {
        name: "Serial required for UPS Units in MAREZI",
        exact: true,
      })
      .check();
    await requirementSave;
    assert.equal(requests.at(-1).body.serial_required, true);
    await page.getByRole("tab", { name: "Models", exact: true }).click();
    await page
      .getByRole("button", { name: "Map Equipment Item", exact: true })
      .click();
    await page
      .getByLabel("Hardware Model", { exact: true })
      .selectOption("mc-model");
    await page
      .getByLabel("Installation Equipment Item", { exact: true })
      .selectOption("ups_count");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page
      .getByRole("heading", { name: "Map Installation Equipment", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(requests.at(-1).body.equipment_field, "ups_count");
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          fixtureOnly: true,
          results,
          equipmentMapping: true,
          errors,
          evidence,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (page) {
      console.error(await page.locator("body").innerText());
      await page.screenshot({
        path: path.join(evidence, "failure.png"),
        fullPage: true,
      });
      console.error(evidence);
    }
    throw error;
  } finally {
    await browser.close();
    await server.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
