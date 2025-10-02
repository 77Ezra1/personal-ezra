declare module 'remark-gfm' {
  const remarkGfm: import('unified').Plugin<[
    import('remark-gfm').Options?
  ]>;
  export default remarkGfm;
}

declare module 'remark-gfm/index.js' {
  const remarkGfm: import('unified').Plugin<[
    import('remark-gfm').Options?
  ]>;
  export default remarkGfm;
}
