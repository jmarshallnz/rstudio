/*
 * Main.cpp
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

#include <iostream>

#include <boost/test/minimal.hpp>

#include <core/Error.hpp>
#include <core/FilePath.hpp>
#include <core/Log.hpp>
#include <core/Thread.hpp>
#include <core/system/System.hpp>
#include <core/system/Environment.hpp>
#include <core/SafeConvert.hpp>

#include <core/http/Request.hpp>
#include <core/http/Response.hpp>

#include <core/http/NamedPipeAsyncClient.hpp>
#include <core/http/NamedPipeBlockingClient.hpp>


#include <session/SessionHttpConnectionListener.hpp>

// TODO: memory management tests
// TODO: security for local session only
// TODO: consider addding PIPE_REJECT_REMOTE_CLIENTS flag


using namespace core ;

const char * const kPipeName = "\\\\.\\pipe\\TestPipeName";

void handleRequest(const http::Request& request, http::Response* pResponse)
{
   pResponse->setStatusCode(http::status::Ok);
   pResponse->setContentType("text/plain");
   pResponse->setBody(request.uri());
}

void serverThread()
{
   try
   {
      /*
      // create server (runs on a background thread)
      http::NamedPipeAsyncServer asyncServer("RStudio");
      asyncServer.setBlockingDefaultHandler(handleRequest);
      Error error = asyncServer.init(kPipeName);
      if (error)
      {
         LOG_ERROR(error);
         return;
      }

      // run server
      error = asyncServer.runSingleThreaded();
      if (error)
      {
         LOG_ERROR(error);
         return;
      }
      */
   }
   CATCH_UNEXPECTED_EXCEPTION
}

void responseHandler(const http::Response& response)
{
   std::cerr << response.body() << std::endl;
}

void errorHandler(const Error& error)
{
   LOG_ERROR(error);
}


int test_main(int argc, char * argv[])
{
   try
   { 
      // setup log
      initializeStderrLog("coredev", core::system::kLogLevelWarning);

      // ignore sigpipe
      Error error = core::system::ignoreSignal(core::system::SigPipe);
      if (error)
         LOG_ERROR(error);


      core::system::setenv("RS_LOCAL_PEER", kPipeName);

      session::initializeHttpConnectionListener();

      boost::asio::io_service ioService;
      http::ConnectionRetryProfile retryProfile(
                              boost::posix_time::seconds(10),
                              boost::posix_time::milliseconds(50));

      for (int i=0; i<1000; i++)
      {
         http::Request request;
         request.setMethod("GET");
         request.setUri("/" + safe_convert::numberToString(i));
         request.setHeader("Accept", "*/*");
         request.setHeader("Connection", "close");

         boost::shared_ptr<http::NamedPipeAsyncClient> pClient(
           new http::NamedPipeAsyncClient(ioService, kPipeName, retryProfile));
         pClient->request().assign(request);
         pClient->execute(responseHandler, errorHandler);
      }


      // run the io service
      boost::system::error_code ec;
      ioService.run(ec);
      if (ec)
      {
         LOG_ERROR(Error(ec, ERROR_LOCATION));
         return EXIT_FAILURE;
      }

      /*
      http::Response response;
      error = http::sendRequest(kPipeName, request, retryProfile, &response);
      if (error)
         LOG_ERROR(error);

      std::cerr << response << std::endl;
      */


      /*
      // create ioservice for client
      boost::asio::io_service ioService;


      boost::asio::io_service ioService;
      http::NamedPipeAsyncClient client(ioService, "MyPipe", retryProfile);
      client.request().assign(myRequest);
      client.execute();


      // run the io service
      boost::system::error_code ec;
      ioService.run(ec);
      if (ec)
      {
         LOG_ERROR(Error(ec, ERROR_LOCATION));
         return EXIT_FAILURE;
      }
      */

      // default connection retry profile
      /*
      http::ConnectionRetryProfile retryProfile(
                              boost::posix_time::seconds(10),
                              boost::posix_time::milliseconds(50));


      */



      return EXIT_SUCCESS;
   }
   CATCH_UNEXPECTED_EXCEPTION
   
   // if we got this far we had an unexpected exception
   return EXIT_FAILURE ;
}

