export const format = {
  type: 'json_schema', name: 'airport_answer_selection', strict: true,
  schema: {
    type: 'object', properties: {
      view: { type: 'string', enum: ['growth', 'rankings', 'comparison', 'methodology', 'weather', 'investment', 'unavailable'] },
      iatas: { type: 'array', items: { type: 'string' } }
    }, required: ['view', 'iatas'], additionalProperties: false
  }
};
export const scope = 'The validated dataset currently covers only LAX, SFO, and BOS.';
export const caveat = 'Passenger growth alone does not establish terminal expansion need or financial profitability. Selected infrastructure and project records are available through the investment assessment tool. Comparable terminal utilization is unavailable. Verified project financial returns are unavailable.';
