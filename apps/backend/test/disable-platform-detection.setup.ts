// snowflake-sdk probes cloud metadata endpoints when it loads; specs never run on a cloud host.
process.env.SNOWFLAKE_DISABLE_PLATFORM_DETECTION = 'true';
