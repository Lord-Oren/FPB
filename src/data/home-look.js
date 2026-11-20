// Shared content boundary. Missing legacy settings resolve without rewriting data.
export const bBackgroundValues = Object.freeze(['standard', 'cream']);
function invalid() {
  const error = new Error('Choose Standard or Cream for the background of version B.');
  error.status = 422;
  error.diagnostics = [{ field: 'look_bBackground', message: error.message }];
  throw error;
}
export function validateBBackground(value = 'standard') {
  if (!bBackgroundValues.includes(value)) invalid();
  return value;
}
export function resolveHomeLook(look) {
  if (look === undefined) return { bBackground: 'standard' };
  if (!look || Object.getPrototypeOf(look) !== Object.prototype ||
      Object.keys(look).some(key => key !== 'bBackground')) invalid();
  return { bBackground: validateBBackground(look.bBackground) };
}
