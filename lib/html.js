class Html extends String { }
export const htmlRaw = str => new Html(str);
export const htmlEncode = (value) => {
    if (value instanceof Html) return value;
    return htmlRaw(String(value).replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':"&quot;"}[t])));
}
export const html = (strings, ...values) => htmlRaw(String.raw({ raw: strings }, ...values.map(htmlEncode)));
