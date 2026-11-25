<script lang="ts">
  interface Props {
    size?: 'sm' | 'lg';
  }

  let { size = 'sm' }: Props = $props();

  const wordOne = [
    { char: 'C', color: '#ef4444' },
    { char: 'O', color: '#f97316' },
    { char: 'L', color: '#f59e0b' },
    { char: 'O', color: '#16a34a' },
    { char: 'R', color: '#0ea5e9' },
  ];

  const wordTwo = [
    { char: 'L', color: '#2563eb' },
    { char: 'I', color: '#7c3aed' },
    { char: 'N', color: '#ec4899' },
    { char: 'K', color: '#0d9488' },
  ];
</script>

<span class="brand-title" class:lg={size === 'lg'} class:sm={size === 'sm'} aria-label="COLOR LINK">
  <span class="word" aria-hidden="true">
    {#each wordOne as item}
      <span class="letter" style="color: {item.color};">{item.char}</span>
    {/each}
  </span>
  <span class="word-gap" aria-hidden="true">
    <span class="link-dot"></span>
  </span>
  <span class="word" aria-hidden="true">
    {#each wordTwo as item}
      <span class="letter" style="color: {item.color};">{item.char}</span>
    {/each}
  </span>
</span>

<style>
  .brand-title {
    display: inline-flex;
    align-items: center;
    font-weight: 900;
    line-height: 1.05;
    user-select: none;
  }

  .word {
    display: inline-flex;
    align-items: center;
  }

  .letter {
    display: inline-block;
  }

  .brand-title.lg {
    font-size: clamp(1.25rem, 4.6vw, 2.05rem);
    letter-spacing: 0.04em;
    gap: 9px;
  }

  .brand-title.sm {
    font-size: 1.05rem;
    letter-spacing: 0.04em;
    gap: 6px;
  }

  .word-gap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .link-dot {
    display: inline-block;
    border-radius: 999px;
    background: linear-gradient(90deg, #0ea5e9, #7c3aed, #ec4899);
  }

  .brand-title.lg .link-dot {
    width: 14px;
    height: 5px;
  }

  .brand-title.sm .link-dot {
    width: 8px;
    height: 3.5px;
  }
</style>
