'use client'

import { Box } from '@radix-ui/themes'

/**
 * NewsletterForm - Wrapper for Sendinblue iframe
 * Constrains width and centers the form for better visual integration
 */
export default function NewsletterForm() {
  return (
    <Box
      mt="8"
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <iframe
        width="100%"
        height="405"
        src="https://20a92129.sibforms.com/serve/MUIFABYzW_uWNXgRXsIeJBbYaL8SynpQhDtrtdX8GBHMHqSvB7JiWc0Go4YILcxxwy0HdlDpLlx2XyWA0sBv_WPmJsrQY2STUr_36HHlf1CDh86LMiIM2o6ZbZZFZhV5m9ZTKaj93bNbRDVGTK59jdJ3WrxlZIbZacFC-uV6wCP6wXGkBOXswGsPpget80X7IgBmKm_2SYMLJ99m"
        frameBorder="0"
        style={{
          display: 'block',
          maxWidth: '600px',
          border: 'none',
        }}
        title="Newsletter Signup"
      />
    </Box>
  )
}
