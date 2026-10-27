const { renderHandoverPages } = require("./handoverPageRenderer.cjs");

async function render(buffer) {
  return renderHandoverPages(buffer);
}
process.once("message", (data) => {
  render(data.buffer)
    .then((pages) => process.send({ pages }, () => process.disconnect()))
    .catch((error) =>
      process.send({ error: error.message }, () => process.disconnect()),
    );
});
