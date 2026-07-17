export default function SuperInfraLogo({ compact = false, big = false }) {
  const classes = ['superinfra-logo'];
  if (compact) classes.push('compact');
  if (big) classes.push('big');

  return (
    <span className={classes.join(' ')} aria-label="Super Infra">
      <img
        src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`}
        alt="Super Infra"
        width="307"
        height="93"
      />
    </span>
  );
}
