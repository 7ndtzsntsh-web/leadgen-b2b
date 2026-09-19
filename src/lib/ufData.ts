export const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** DDDs de cada estado. Usado para descartar telefones de outra região. */
export const UF_DDDS: Record<string, string[]> = {
  AC: ["68"], AL: ["82"], AP: ["96"], AM: ["92", "97"], BA: ["71", "73", "74", "75", "77"],
  CE: ["85", "88"], DF: ["61"], ES: ["27", "28"], GO: ["61", "62", "64"], MA: ["98", "99"],
  MT: ["65", "66"], MS: ["67"], MG: ["31", "32", "33", "34", "35", "37", "38"],
  PA: ["91", "93", "94"], PB: ["83"], PR: ["41", "42", "43", "44", "45", "46"],
  PE: ["81", "87"], PI: ["86", "89"], RJ: ["21", "22", "24"], RN: ["84"],
  RS: ["51", "53", "54", "55"], RO: ["69"], RR: ["95"], SC: ["47", "48", "49"],
  SP: ["11", "12", "13", "14", "15", "16", "17", "18", "19"], SE: ["79"], TO: ["63"],
};
