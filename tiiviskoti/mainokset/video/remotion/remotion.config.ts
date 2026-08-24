import { Config } from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Remotion lataa oman Chrome Headless Shellinsä. Järjestelmän Chromeen
// ohjaaminen EI toimi: se ei saa yhteyttä Remotionin localhost-bundleriin.
