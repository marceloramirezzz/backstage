// A form field as text, empty when absent.
export const text = (form: FormData, name: string) => String(form.get(name) ?? "");

// Whole numbers from a number field; NaN when it's blank or not one.
export const whole = (value: string) => (value.trim() === "" ? NaN : Number(value));
